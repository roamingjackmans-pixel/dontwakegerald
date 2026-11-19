// Don't Wake Gerald connection settings.
//
// peerPrefix: PeerJS ids for rooms and friends start with this (change it to start a separate "world" of players).
// iceServers (optional): extra STUN/TURN servers for peer-to-peer, e.g.
//   [{ urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }]
window.DWG_CONFIG = {
  peerPrefix: 'dontwakegerald-v1-',
  iceServers: null,
};
