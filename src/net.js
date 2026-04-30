// Multiplayer using Trystero (WebRTC + BitTorrent-tracker signaling).
// PeerJS's public broker (0.peerjs.com) was unreliable; trystero uses multiple
// redundant trackers, so there's no single broker to fail.
//
// Topology: star — host owns the simulation and broadcasts the roster every
// tick. Joiners send their own state to the host, which the host re-publishes.
// All clients are static (no server); works on GitHub Pages.

import { joinRoom, selfId } from 'trystero';

const APP_ID = 'cosmoscope-universe';
const ROOM_PREFIX = 'csms-';        // keep room ids short
const TICK_HZ = 12;                 // state broadcasts per second
const FOLLOW_SPACING = 12;          // ship-lengths between followers in line
const JOIN_TIMEOUT_MS = 20000;

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Clean snapshot of our local ship state to send over the wire.
function snapshot(localId, name, tier, ship, config, isFollower, alive, fires, isHost) {
  return {
    id: localId,
    name,
    tier,
    follow: !!isFollower,
    isHost: !!isHost,
    alive: alive !== false,
    fires: fires && fires.length ? fires : undefined,
    config,
    pos: [ship.shipWorldPos.x, ship.shipWorldPos.y, ship.shipWorldPos.z],
    quat: [ship.quat.x, ship.quat.y, ship.quat.z, ship.quat.w],
    vis: ship.visualUnits,
    t: performance.now(),
  };
}

export class Net {
  constructor() {
    this.mode = 'solo';            // 'solo' | 'host' | 'join'
    this.code = null;
    this.localId = null;
    this.localName = null;
    this.followingHost = false;

    this.room = null;              // trystero Room
    this._actions = null;          // { sendState, sendRoster, sendHit, sendHello }

    this.knownPeers = new Set();   // every peer in the room (by trystero id)
    this.peers = new Map();        // peerId -> last snapshot
    this.hostId = null;            // joiner: id of the host's peer

    // Host-only: ordered list of followers (by join time) for the line.
    this.followers = [];

    // Local ship reference + metadata (set by attach()).
    this.local = null;

    // Local-only flags toggled at runtime by the in-game UI.
    this.alive = true;
    this._pendingFires = [];
    this._pendingHits = [];

    // Invasion state. Host owns it; joiners get a copy via roster.
    this.invasion = { active: false, aliens: [], fires: [] };
    this.onInvasionUpdate = () => {};
    this.onInvasionWin = () => {};
    this.onAlienHit = () => {};

    // Callbacks the rest of the app can hook into.
    this.onPeerJoin   = () => {};
    this.onPeerLeave  = () => {};
    this.onPeerUpdate = () => {};
    this.onTierChange = () => {};
    this.onStatus     = () => {};

    this._tickTimer = null;
  }

  attach(local) {
    this.local = local;
    this.localName = local.getName();
  }

  // -------------------- Solo --------------------
  startSolo() {
    this.mode = 'solo';
    return Promise.resolve();
  }

  // -------------------- Shared room setup --------------------
  _leaveRoom() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
    if (this.room) {
      try { this.room.leave(); } catch (_) {}
    }
    this.room = null;
    this._actions = null;
    this.knownPeers.clear();
    this.peers.clear();
    this.followers.length = 0;
    this.hostId = null;
    this.localId = null;
  }

  _setupRoom(code) {
    const room = joinRoom({ appId: APP_ID }, ROOM_PREFIX + code);
    this.room = room;
    this.localId = selfId;

    // Action handles. Trystero requires action names <= 12 chars.
    const [sendState,  getState ] = room.makeAction('state');
    const [sendRoster, getRoster] = room.makeAction('roster');
    const [sendHit,    getHit   ] = room.makeAction('hit');
    const [sendHello,  getHello ] = room.makeAction('hello');
    this._actions = { sendState, sendRoster, sendHit, sendHello };

    // Greet new peers immediately so they learn our role.
    room.onPeerJoin((peerId) => {
      this.knownPeers.add(peerId);
      try { sendHello({ isHost: this.mode === 'host', name: this.localName }, peerId); } catch (_) {}
      this.onStatus(`peer ${peerId.slice(0, 6)} joined room`);
    });

    room.onPeerLeave((peerId) => {
      this.knownPeers.delete(peerId);
      if (peerId === this.hostId) {
        this.onStatus('host left the room');
        this.hostId = null;
      }
      this._removePeer(peerId);
    });

    getHello((data, peerId) => {
      if (data?.isHost) {
        this.hostId = peerId;
        if (this._onHostFound) this._onHostFound();
      }
    });

    getState((snap, peerId) => {
      if (this.mode !== 'host') return;     // only host consumes joiner state
      snap.id = peerId;                      // trust transport-level id
      this.peers.set(peerId, snap);
      if (snap.follow) {
        if (!this.followers.includes(peerId)) this.followers.push(peerId);
      } else {
        const idx = this.followers.indexOf(peerId);
        if (idx >= 0) this.followers.splice(idx, 1);
      }
      this.onPeerUpdate(peerId, snap);
    });

    getRoster((msg, peerId) => {
      if (this.mode !== 'join') return;     // only joiners consume roster
      if (peerId !== this.hostId) return;   // trust only the designated host
      this.hostId = msg.hostId || this.hostId;
      for (const snap of msg.snaps) {
        if (snap.id === this.localId) continue;
        this.peers.set(snap.id, snap);
        this.onPeerUpdate(snap.id, snap);
      }
      const present = new Set(msg.snaps.map(s => s.id));
      for (const id of [...this.peers.keys()]) {
        if (!present.has(id)) {
          this.peers.delete(id);
          this.onPeerLeave(id);
        }
      }
      if (this.followingHost && msg.hostTier !== undefined) {
        this.onTierChange(msg.hostTier);
      }
      if (this.followingHost && msg.followPose) {
        this.local.applyFollowPose(msg.followPose);
      }
      if (msg.invasion) {
        const wasActive = this.invasion.active;
        this.invasion = msg.invasion;
        this.onInvasionUpdate(this.invasion);
        if (msg.invasion.won) this.onInvasionWin();
        else if (wasActive && !msg.invasion.active) this.onInvasionUpdate(this.invasion);
      }
    });

    getHit((msg, peerId) => {
      if (this.mode !== 'host') return;
      this.onAlienHit(msg.alienId, msg.damage);
    });

    return room;
  }

  _removePeer(id) {
    this.peers.delete(id);
    const idx = this.followers.indexOf(id);
    if (idx >= 0) this.followers.splice(idx, 1);
    this.onPeerLeave(id);
  }

  // -------------------- Host --------------------
  host() {
    this.mode = 'host';
    this._leaveRoom();
    this.code = randomCode();
    return new Promise((resolve, reject) => {
      try {
        this._setupRoom(this.code);
        this._startTick();
        // No handshake needed — the room exists the moment we join it.
        resolve(this.code);
      } catch (err) {
        this._leaveRoom();
        reject(new Error('Could not start room: ' + (err?.message || err)));
      }
    });
  }

  // -------------------- Join --------------------
  join(code, follow) {
    this.mode = 'join';
    this.code = code.toUpperCase();
    this.followingHost = !!follow;
    this._leaveRoom();
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout = null;

      const cleanup = () => {
        this._onHostFound = null;
        if (timeout) clearTimeout(timeout);
      };

      const fail = (msg) => {
        if (settled) return;
        settled = true;
        cleanup();
        this._leaveRoom();
        reject(new Error(msg));
      };

      this._onHostFound = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this._startTick();
        this.onStatus('connected to host');
        resolve();
      };

      try {
        this._setupRoom(this.code);
      } catch (err) {
        fail('Could not connect to signaling network: ' + (err?.message || err));
        return;
      }

      timeout = setTimeout(() => {
        fail('Could not reach host (timeout). Make sure the code is correct and the host is still in the lobby.');
      }, JOIN_TIMEOUT_MS);
    });
  }

  // -------------------- Tick --------------------
  _startTick() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = setInterval(() => this._tick(), 1000 / TICK_HZ);
  }

  _tick() {
    if (!this.local || !this._actions) return;
    const fires = this._pendingFires;
    this._pendingFires = [];
    const isHost = this.mode === 'host';
    const snap = snapshot(
      this.localId,
      this.localName,
      this.local.getTier(),
      { shipWorldPos: this.local.getShipWorldPos(), quat: this.local.ship.quat, visualUnits: this.local.ship.visualUnits },
      this.local.getConfig(),
      this.followingHost,
      this.alive,
      fires,
      isHost,
    );

    if (isHost) {
      // Build the roster: host + every connected joiner's last snapshot.
      const snaps = [snap, ...this.peers.values()];
      const hostForward = new HostForward(this.local.ship.quat);

      // Per-follower assigned pose (so other peers see them where the host does).
      const followPoseFor = new Map();
      for (const peerId of this.followers) {
        const fSnap = this.peers.get(peerId);
        if (!fSnap || !fSnap.follow) continue;
        const rank = this.followers.indexOf(peerId);
        if (rank < 0) continue;
        const spacing = FOLLOW_SPACING * Math.max(this.local.ship.visualUnits, 1e-30);
        const dist = (rank + 1) * spacing;
        const pose = {
          tier: snap.tier,
          pos: [
            snap.pos[0] + hostForward.x * -dist,
            snap.pos[1] + hostForward.y * -dist,
            snap.pos[2] + hostForward.z * -dist,
          ],
          quat: snap.quat.slice(),
        };
        followPoseFor.set(peerId, pose);
        // Mutate the roster snap so other peers render the follower in line.
        fSnap.pos = pose.pos.slice();
        fSnap.quat = pose.quat.slice();
        fSnap.tier = pose.tier;
      }

      // Send roster to each peer with their personal followPose.
      for (const peerId of this.knownPeers) {
        const followPose = followPoseFor.get(peerId) || null;
        try {
          this._actions.sendRoster({
            snaps,
            hostId: this.localId,
            hostTier: snap.tier,
            followPose,
            invasion: this.invasion,
          }, peerId);
        } catch (_) {}
      }

      // Clear alien-fire events now that they've been broadcast.
      if (this.invasion && this.invasion.fires && this.invasion.fires.length) {
        this.invasion.fires = [];
      }
    } else if (this.mode === 'join') {
      if (!this.hostId) return;
      try { this._actions.sendState(snap, this.hostId); } catch (_) {}
      for (const h of this._pendingHits) {
        try { this._actions.sendHit({ alienId: h.alienId, damage: h.damage }, this.hostId); } catch (_) {}
      }
      this._pendingHits.length = 0;
    }
  }

  disconnect() {
    this._leaveRoom();
  }

  // ---- Runtime toggles, callable from the in-game UI ----
  setFollowingHost(on) {
    if (this.mode !== 'join') return;
    this.followingHost = !!on;
  }

  setAlive(on) {
    this.alive = !!on;
  }

  queueFire(pos, dir, speed) {
    this._pendingFires.push({
      pos: [pos.x, pos.y, pos.z],
      dir: [dir.x, dir.y, dir.z],
      speed,
      t: performance.now(),
    });
  }

  reportHit(alienId, damage) {
    if (this.mode !== 'join') return;
    this._pendingHits.push({ alienId, damage });
  }

  setInvasionState(state) {
    this.invasion = state;
  }
}

// Helper: ship "forward" axis is local -Z transformed by quaternion.
class HostForward {
  constructor(quat) {
    const x = 0, y = 0, z = -1;
    const qx = quat.x, qy = quat.y, qz = quat.z, qw = quat.w;
    const ix =  qw * x + qy * z - qz * y;
    const iy =  qw * y + qz * x - qx * z;
    const iz =  qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  }
}
