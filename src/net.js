// Multiplayer using PeerJS (WebRTC + free public signaling broker).
// Topology: star — host owns the room and relays state to every joiner.
// All clients are static (no server); works on GitHub Pages.

const ROOM_PREFIX = 'cosmoscope-';
const TICK_HZ = 12;                 // state broadcasts per second
const FOLLOW_SPACING = 12;          // ship-lengths between followers in line

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Clean snapshot of our local ship state to send over the wire.
function snapshot(localId, name, tier, ship, config, isFollower, alive, fires) {
  return {
    id: localId,
    name,
    tier,
    follow: !!isFollower,
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

    this.peer = null;              // PeerJS Peer
    this.connsById = new Map();    // peerId -> DataConnection
    this.peers = new Map();        // peerId -> last snapshot
    this.hostId = null;            // joiner: id of the host's ship snapshot

    // Host-only: ordered list of followers (by join time) for the line formation.
    this.followers = [];

    // Local ship reference + metadata (set by attach()).
    this.local = null;             // { ship, getShipWorldPos, getTier, getConfig, getName }

    // Local-only flags toggled at runtime by the in-game UI.
    this.alive = true;
    this._pendingFires = [];       // outgoing fire events queued for next tick
    this._pendingHits = [];        // joiner -> host: alien hit reports queued

    // Invasion state. The host owns the simulation; joiners get a copy via roster.
    // Shape: { active: bool, aliens: [{id,kind,pos,quat,hp,maxHp,size}], fires: [...] }
    this.invasion = { active: false, aliens: [], fires: [] };
    this.onInvasionUpdate = () => {};
    this.onInvasionWin = () => {};
    this.onAlienHit = () => {};    // host-side: a joiner reported a hit

    // Callbacks the rest of the app can hook into.
    this.onPeerJoin   = () => {};
    this.onPeerLeave  = () => {};
    this.onPeerUpdate = () => {};
    this.onTierChange = () => {};  // followers: switch to host's tier
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

  // -------------------- Host --------------------
  host() {
    this.mode = 'host';
    this.code = randomCode();
    return new Promise((resolve, reject) => {
      this.peer = new window.Peer(ROOM_PREFIX + this.code, {
        debug: 0,
      });
      this.peer.on('open', (id) => {
        this.localId = id;
        this.peer.on('connection', (conn) => this._handleHostConn(conn));
        this._startTick();
        resolve(this.code);
      });
      // The PeerJS public broker drops idle peers after a few minutes,
      // which silently breaks new joins (existing data connections keep
      // working but the broker no longer accepts new ones for our id).
      // Reconnect re-registers the same id on the broker.
      this.peer.on('disconnected', () => {
        this.onStatus('broker disconnected — reconnecting');
        try { this.peer.reconnect(); } catch (_) { /* will retry */ }
      });
      this.peer.on('error', (err) => {
        // 'network'/'disconnected' style errors after open shouldn't reject
        // the original host() promise (room already running). Only errors
        // before open mean the room never started.
        if (this.localId) {
          this.onStatus('peer error: ' + (err && err.type ? err.type : err));
          if (err && (err.type === 'network' || err.type === 'disconnected')) {
            try { this.peer.reconnect(); } catch (_) {}
          }
          return;
        }
        reject(err);
      });
    });
  }

  _handleHostConn(conn) {
    conn.on('open', () => {
      this.connsById.set(conn.peer, conn);
      this.followers.push(conn.peer);   // initial assumption; revised on first message
      this.onStatus(`peer ${conn.peer} connected`);
    });
    conn.on('data', (msg) => {
      if (msg.type === 'state') {
        this.peers.set(conn.peer, msg.snap);
        // Track follower order: only count actual followers.
        if (msg.snap.follow) {
          if (!this.followers.includes(conn.peer)) this.followers.push(conn.peer);
        } else {
          const idx = this.followers.indexOf(conn.peer);
          if (idx >= 0) this.followers.splice(idx, 1);
        }
        this.onPeerUpdate(conn.peer, msg.snap);
      } else if (msg.type === 'hit') {
        // Joiner reports they damaged an alien. Host applies it authoritatively.
        this.onAlienHit(msg.alienId, msg.damage);
      }
    });
    conn.on('close', () => this._removePeer(conn.peer));
    conn.on('error', () => this._removePeer(conn.peer));
  }

  _removePeer(id) {
    this.connsById.delete(id);
    this.peers.delete(id);
    const idx = this.followers.indexOf(id);
    if (idx >= 0) this.followers.splice(idx, 1);
    this.onPeerLeave(id);
  }

  // -------------------- Join --------------------
  join(code, follow) {
    this.mode = 'join';
    this.code = code.toUpperCase();
    this.followingHost = !!follow;    return new Promise((resolve, reject) => {
      this.peer = new window.Peer({ debug: 0 });
      // Same broker-drop reconnect logic as host — keeps the joiner alive
      // through long sessions.
      this.peer.on('disconnected', () => {
        this.onStatus('broker disconnected — reconnecting');
        try { this.peer.reconnect(); } catch (_) {}
      });
      this.peer.on('open', (id) => {
        this.localId = id;
        const conn = this.peer.connect(ROOM_PREFIX + this.code, { reliable: false });
        const timeout = setTimeout(() => reject(new Error('Could not reach host (timeout)')), 8000);
        conn.on('open', () => {
          clearTimeout(timeout);
          this.connsById.set('host', conn);
          this._startTick();
          resolve();
        });
        conn.on('data', (msg) => {
          if (msg.type === 'roster') {
            this.hostId = msg.hostId || this.hostId;
            // Host pushed the full roster + tier + (optional) follower-target pose.
            for (const snap of msg.snaps) {
              if (snap.id === this.localId) continue;
              this.peers.set(snap.id, snap);
              this.onPeerUpdate(snap.id, snap);
            }
            // Drop any peer no longer in the roster.
            const present = new Set(msg.snaps.map(s => s.id));
            for (const id of [...this.peers.keys()]) {
              if (!present.has(id) && id !== 'host') {
                this.peers.delete(id);
                this.onPeerLeave(id);
              }
            }
            // If follower, sync our tier to the host's.
            if (this.followingHost && msg.hostTier !== undefined) {
              this.onTierChange(msg.hostTier);
            }
            // If follower, host also tells us where to sit in the line.
            if (this.followingHost && msg.followPose) {
              this.local.applyFollowPose(msg.followPose);
            }
            // Invasion world state from the host.
            if (msg.invasion) {
              const wasActive = this.invasion.active;
              this.invasion = msg.invasion;
              this.onInvasionUpdate(this.invasion);
              if (msg.invasion.won) this.onInvasionWin();
              else if (wasActive && !msg.invasion.active) this.onInvasionUpdate(this.invasion);
            }
          }
        });
        conn.on('close', () => {
          clearTimeout(timeout);
          this.onStatus('disconnected from host');
          for (const id of [...this.peers.keys()]) this.onPeerLeave(id);
          this.peers.clear();
        });
        conn.on('error', (e) => reject(e));
      });
      this.peer.on('error', (err) => reject(err));
    });
  }

  // -------------------- Tick --------------------
  _startTick() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = setInterval(() => this._tick(), 1000 / TICK_HZ);
  }

  _tick() {
    if (!this.local) return;
    const fires = this._pendingFires;
    this._pendingFires = [];
    const snap = snapshot(
      this.localId,
      this.localName,
      this.local.getTier(),
      { shipWorldPos: this.local.getShipWorldPos(), quat: this.local.ship.quat, visualUnits: this.local.ship.visualUnits },
      this.local.getConfig(),
      this.followingHost,
      this.alive,
      fires,
    );

    if (this.mode === 'host') {
      // Build the roster: host + every connected joiner's last snapshot.
      const snaps = [snap, ...this.peers.values()];
      // For each follower, compute a "pose" behind the host in the line.
      const hostForward = new HostForward(this.local.ship.quat);
      for (const conn of this.connsById.values()) {
        const isFollower = (this.peers.get(conn.peer)?.follow);
        let followPose = null;
        if (isFollower) {
          const rank = this.followers.indexOf(conn.peer); // 0 = first follower
          if (rank >= 0) {
            const spacing = FOLLOW_SPACING * Math.max(this.local.ship.visualUnits, 1e-30);
            const dist = (rank + 1) * spacing;
            followPose = {
              tier: snap.tier,
              pos: [
                snap.pos[0] + hostForward.x * -dist,   // BEHIND host (forward is -Z)
                snap.pos[1] + hostForward.y * -dist,
                snap.pos[2] + hostForward.z * -dist,
              ],
              quat: snap.quat,
            };
            // The follower in this snapshot should reflect the assigned pose
            // so the *other* peers see it in the same place we do.
            const fSnap = this.peers.get(conn.peer);
            if (fSnap) {
              fSnap.pos = followPose.pos.slice();
              fSnap.quat = followPose.quat.slice();
              fSnap.tier = followPose.tier;
            }
          }
        }
        try {
          conn.send({
            type: 'roster',
            snaps,
            hostId: this.localId,
            hostTier: snap.tier,
            followPose,
            invasion: this.invasion,
          });
        } catch (_) {}
      }
      // Clear alien-fire events now that they've been broadcast — otherwise
      // joiners would re-spawn the same bullets every tick.
      if (this.invasion && this.invasion.fires && this.invasion.fires.length) {
        this.invasion.fires = [];
      }
    } else if (this.mode === 'join') {
      const conn = this.connsById.get('host');
      if (conn && conn.open) {
        try { conn.send({ type: 'state', snap }); } catch (_) {}
        // Forward any queued alien hits.
        for (const h of this._pendingHits) {
          try { conn.send({ type: 'hit', alienId: h.alienId, damage: h.damage }); } catch (_) {}
        }
        this._pendingHits.length = 0;
      }
    }
  }

  disconnect() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
    if (this.peer) try { this.peer.destroy(); } catch (_) {}
    this.peer = null;
    this.connsById.clear();
    this.peers.clear();
  }

  // ---- Runtime toggles, callable from the in-game UI ----
  setFollowingHost(on) {
    if (this.mode !== 'join') return;
    this.followingHost = !!on;
  }

  setAlive(on) {
    this.alive = !!on;
  }

  // Queue a fire event to be sent on the next tick.
  queueFire(pos, dir, speed) {
    this._pendingFires.push({
      pos: [pos.x, pos.y, pos.z],
      dir: [dir.x, dir.y, dir.z],
      speed,
      t: performance.now(),
    });
  }

  // Joiner-side: report damage to host. Host accumulates and applies.
  reportHit(alienId, damage) {
    if (this.mode !== 'join') return;
    this._pendingHits.push({ alienId, damage });
  }

  // Host-side: replace the broadcast invasion world state.
  setInvasionState(state) {
    this.invasion = state;
  }
}

// Helper: ship "forward" axis is local -Z transformed by quaternion.
class HostForward {
  constructor(quat) {
    // forward = (0, 0, -1) rotated by quat
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
