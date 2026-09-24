// Tiny chiptune player for the pocket console. Original short loops, generated with Web Audio.
(function (scope) {
  'use strict';
  // Notes: MIDI numbers, 0 = rest. Each step is an eighth note.
  const TRACKS = [
    { name: 'Picnic Loop', bpm: 112,
      lead: [72,0,76,79,77,76,74,0, 72,74,76,72,69,0,0,0, 71,0,74,77,76,74,72,0, 71,72,74,71,67,0,0,0],
      bass: [48,48,55,55,53,53,55,55, 45,45,52,52,53,53,55,55, 43,43,50,50,48,48,50,50, 43,43,47,47,48,48,48,48] },
    { name: 'Rainy Window', bpm: 88,
      lead: [69,0,72,0,76,0,74,72, 71,0,0,0,67,0,69,71, 72,0,76,0,79,0,77,76, 74,0,0,0,0,0,0,0],
      bass: [45,52,57,52,45,52,57,52, 43,50,55,50,43,50,55,50, 41,48,53,48,41,48,53,48, 43,50,55,50,47,50,55,50] },
    { name: 'Night Market', bpm: 132,
      lead: [79,79,76,0,79,81,79,76, 74,74,72,0,74,76,74,0, 77,77,74,0,77,79,77,74, 72,0,76,0,72,0,0,0],
      bass: [48,0,48,0,55,0,48,0, 50,0,50,0,57,0,50,0, 53,0,53,0,60,0,53,0, 48,0,55,0,48,0,0,0] }
  ];
  const freq = n => 440 * Math.pow(2, (n - 69) / 12);
  let ctx = null, master = null, timer = null, step = 0, nextTime = 0;
  const state = { track: 0, playing: false, volume: 0.5, listeners: [] };
  const notify = () => state.listeners.forEach(fn => fn(api.info()));

  function voice(type, f, t, dur, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function schedule() {
    const tr = TRACKS[state.track], len = 60 / tr.bpm / 2;
    while (nextTime < ctx.currentTime + 0.15) {
      const i = step % tr.lead.length;
      if (tr.lead[i]) voice('square', freq(tr.lead[i]), nextTime, len * 0.9, 0.09);
      if (tr.bass[i]) voice('triangle', freq(tr.bass[i]), nextTime, len * 0.95, 0.16);
      nextTime += len; step++;
    }
  }
  const api = {
    tracks: TRACKS.map(t => t.name),
    info() { return { track: state.track, name: TRACKS[state.track].name, playing: state.playing, volume: state.volume, count: TRACKS.length }; },
    onChange(fn) { state.listeners.push(fn); fn(api.info()); },
    play() {
      const AC = scope.AudioContext || scope.webkitAudioContext; if (!AC) return;
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination); }
      ctx.resume(); master.gain.value = state.volume * 0.6;
      step = 0; nextTime = ctx.currentTime + 0.05;
      clearInterval(timer); timer = setInterval(schedule, 40); schedule();
      state.playing = true; notify();
    },
    pause() { clearInterval(timer); timer = null; state.playing = false; notify(); },
    toggle() { state.playing ? api.pause() : api.play(); },
    next(d = 1) { state.track = (state.track + d + TRACKS.length) % TRACKS.length; if (state.playing) api.play(); else notify(); },
    volume(d) { state.volume = Math.max(0, Math.min(1, Math.round((state.volume + d) * 10) / 10)); if (master) master.gain.value = state.volume * 0.6; notify(); }
  };
  scope.CCBgm = api;
})(window);
