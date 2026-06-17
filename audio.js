// audio.js - Web Audio APIを使用したプロシージャル環境音合成エンジン

class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    
    // 音源の定義
    this.sources = {
      rain: {
        name: '雨の音',
        isPlaying: false,
        volume: 0.5,
        nodes: null,
        start: () => this.startRain(),
        stop: () => this.stopRain()
      },
      waves: {
        name: '波の音',
        isPlaying: false,
        volume: 0.5,
        nodes: null,
        start: () => this.startWaves(),
        stop: () => this.stopWaves()
      },
      forest: {
        name: '森の鳥と風',
        isPlaying: false,
        volume: 0.5,
        nodes: null,
        birdTimer: null,
        start: () => this.startForest(),
        stop: () => this.stopForest()
      },
      whiteNoise: {
        name: 'ホワイトノイズ',
        isPlaying: false,
        volume: 0.5,
        nodes: null,
        start: () => this.startWhiteNoise(),
        stop: () => this.stopWhiteNoise()
      }
    };
  }

  // AudioContextの初期化（ユーザーの操作契機で呼び出す）
  init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  // 汎用のピンクノイズバッファ作成 (Paul Kelletの洗練されたアルゴリズム)
  createPinkNoiseBuffer() {
    const bufferSize = 4 * this.ctx.sampleRate; // 4秒のループ
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    let b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0;
    
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11; // 音量のスケーリング
      b6 = white * 0.115926;
    }
    
    return buffer;
  }

  // 汎用のホワイトノイズバッファ作成
  createWhiteNoiseBuffer() {
    const bufferSize = 2 * this.ctx.sampleRate; // 2秒のループ
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }

  // 音量変更
  setVolume(id, volume) {
    if (!this.sources[id]) return;
    this.sources[id].volume = volume;
    
    const nodes = this.sources[id].nodes;
    if (nodes && nodes.gainNode) {
      // スムーズに音量を変更
      nodes.gainNode.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
  }

  // 再生/停止のトグル
  toggleSound(id) {
    this.init(); // 未初期化なら初期化
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const sound = this.sources[id];
    if (!sound) return false;

    if (sound.isPlaying) {
      sound.stop();
      sound.isPlaying = false;
    } else {
      sound.start();
      sound.isPlaying = true;
    }
    return sound.isPlaying;
  }

  // -----------------------------------------------------------------
  // 1. 雨の音 (Rain) の合成
  // -----------------------------------------------------------------
  startRain() {
    const pinkNoise = this.ctx.createBufferSource();
    pinkNoise.buffer = this.createPinkNoiseBuffer();
    pinkNoise.loop = true;

    // 低域を強調し、高域を抑えるローパスフィルター (雨のザーというベース音)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, this.ctx.currentTime);

    // 音量制御
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(this.sources.rain.volume, this.ctx.currentTime);

    pinkNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    pinkNoise.start(0);

    // 雨粒の「ポツポツ」音をランダムに生成するタイマー
    const dropTimer = setInterval(() => {
      if (!this.sources.rain.isPlaying) {
        clearInterval(dropTimer);
        return;
      }
      // ランダムな確率で雨粒を降らせる
      if (Math.random() > 0.3) {
        this.triggerRainDrop();
      }
    }, 150);

    this.sources.rain.nodes = {
      sourceNode: pinkNoise,
      filterNode: filter,
      gainNode: gainNode,
      intervalId: dropTimer
    };
  }

  triggerRainDrop() {
    if (!this.ctx || this.ctx.state === 'suspended') return;

    // 雨粒の短いクリック音
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    // 高めの周波数でピッチを急速に落とす
    const baseFreq = 1200 + Math.random() * 800;
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.04);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    filter.Q.setValueAtTime(3, this.ctx.currentTime);

    const dropVol = 0.01 + Math.random() * 0.03;
    gain.gain.setValueAtTime(dropVol * this.sources.rain.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  stopRain() {
    const nodes = this.sources.rain.nodes;
    if (nodes) {
      if (nodes.sourceNode) nodes.sourceNode.stop();
      if (nodes.intervalId) clearInterval(nodes.intervalId);
      this.sources.rain.nodes = null;
    }
  }

  // -----------------------------------------------------------------
  // 2. 波の音 (Ocean Waves) の合成
  // -----------------------------------------------------------------
  startWaves() {
    const pinkNoise = this.ctx.createBufferSource();
    pinkNoise.buffer = this.createPinkNoiseBuffer();
    pinkNoise.loop = true;

    // 動的フィルター
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);

    // 音量制御
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);

    pinkNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    // LFO (低周波発振器) で波の満ち引きを再現 (周期: 約 12 秒)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 0.08Hz = 12.5秒周期

    // LFOの出力を音量とフィルター周波数にマッピング
    const lfoGainVol = this.ctx.createGain();
    // 波が引いた時も少し音が残るようにベース音量(0.1)を設定し、LFOで音量を0.1〜0.6の間で揺らす
    lfoGainVol.gain.setValueAtTime(0.25 * this.sources.waves.volume, this.ctx.currentTime);
    
    const lfoGainFilter = this.ctx.createGain();
    // フィルターの周波数を 250Hz から 800Hz の間で揺らす
    lfoGainFilter.gain.setValueAtTime(300, this.ctx.currentTime);

    // バイアス用（一定値の加算）
    const volBias = this.ctx.createGain();
    volBias.gain.setValueAtTime(0.3 * this.sources.waves.volume, this.ctx.currentTime);

    const filterBias = this.ctx.createGain();
    filterBias.gain.setValueAtTime(500, this.ctx.currentTime);

    // LFOをボリュームとフィルターに接続
    lfo.connect(lfoGainVol);
    lfoGainVol.connect(gainNode.gain);
    
    lfo.connect(lfoGainFilter);
    lfoGainFilter.connect(filter.frequency);

    pinkNoise.start(0);
    lfo.start(0);

    this.sources.waves.nodes = {
      sourceNode: pinkNoise,
      lfoNode: lfo,
      filterNode: filter,
      gainNode: gainNode,
      lfoGainVol: lfoGainVol,
      volBias: volBias
    };
  }

  stopWaves() {
    const nodes = this.sources.waves.nodes;
    if (nodes) {
      if (nodes.sourceNode) nodes.sourceNode.stop();
      if (nodes.lfoNode) nodes.lfoNode.stop();
      this.sources.waves.nodes = null;
    }
  }

  // -----------------------------------------------------------------
  // 3. 森の風と鳥のさえずり (Forest) の合成
  // -----------------------------------------------------------------
  startForest() {
    // 森のそよ風 (ピンクノイズ + バンドパスフィルター)
    const pinkNoise = this.ctx.createBufferSource();
    pinkNoise.buffer = this.createPinkNoiseBuffer();
    pinkNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(this.sources.forest.volume * 0.15, this.ctx.currentTime);

    // 風のうねりを表現する低速LFO
    const windLFO = this.ctx.createOscillator();
    windLFO.type = 'sine';
    windLFO.frequency.setValueAtTime(0.04, this.ctx.currentTime); // 25秒周期の風

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.08 * this.sources.forest.volume, this.ctx.currentTime);

    windLFO.connect(lfoGain);
    lfoGain.connect(gainNode.gain);

    pinkNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    pinkNoise.start(0);
    windLFO.start(0);

    // 鳥のさえずりを定期的に鳴らすタイマー (6秒〜12秒のランダム間隔)
    const scheduleNextBird = () => {
      if (!this.sources.forest.isPlaying) return;
      
      const delay = 5000 + Math.random() * 8000;
      this.sources.forest.birdTimer = setTimeout(() => {
        this.triggerBirdChirp();
        scheduleNextBird();
      }, delay);
    };

    scheduleNextBird();

    this.sources.forest.nodes = {
      sourceNode: pinkNoise,
      windLFONode: windLFO,
      filterNode: filter,
      gainNode: gainNode
    };
  }

  triggerBirdChirp() {
    if (!this.ctx || this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    const numChirps = 2 + Math.floor(Math.random() * 3); // 2〜4回の連続した鳴き声
    let chirpTime = now;

    // 鳥の種類による基本ピッチ
    const baseFreq = 2200 + Math.random() * 800;

    for (let i = 0; i < numChirps; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      
      // 鳥の鳴き声特有の「ピピッ」というピッチ上昇・降下スイープ
      osc.frequency.setValueAtTime(baseFreq, chirpTime);
      osc.frequency.quadraticRampToValueAtTime(baseFreq * 1.3, chirpTime + 0.03);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, chirpTime + 0.12);

      const chirpVol = (0.015 + Math.random() * 0.02) * this.sources.forest.volume;
      gain.gain.setValueAtTime(0, chirpTime);
      gain.gain.linearRampToValueAtTime(chirpVol, chirpTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, chirpTime + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(chirpTime);
      osc.stop(chirpTime + 0.13);

      // 次の鳴き声までの間隔
      chirpTime += 0.15 + Math.random() * 0.1;
    }
  }

  stopForest() {
    const nodes = this.sources.forest.nodes;
    if (nodes) {
      if (nodes.sourceNode) nodes.sourceNode.stop();
      if (nodes.windLFONode) nodes.windLFONode.stop();
      if (this.sources.forest.birdTimer) clearTimeout(this.sources.forest.birdTimer);
      this.sources.forest.nodes = null;
    }
  }

  // -----------------------------------------------------------------
  // 4. ホワイトノイズの合成
  // -----------------------------------------------------------------
  startWhiteNoise() {
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = this.createWhiteNoiseBuffer();
    whiteNoise.loop = true;

    // 音を少し柔らかくするための緩いローパスフィルター
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, this.ctx.currentTime);

    // 音量制御
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(this.sources.whiteNoise.volume * 0.4, this.ctx.currentTime); // ホワイトノイズはうるさいので少し小さめに

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    whiteNoise.start(0);

    this.sources.whiteNoise.nodes = {
      sourceNode: whiteNoise,
      filterNode: filter,
      gainNode: gainNode
    };
  }

  stopWhiteNoise() {
    const nodes = this.sources.whiteNoise.nodes;
    if (nodes) {
      if (nodes.sourceNode) nodes.sourceNode.stop();
      this.sources.whiteNoise.nodes = null;
    }
  }

  // -----------------------------------------------------------------
  // 5. アラートチャイム (心地よいシンセチャイム)
  // -----------------------------------------------------------------
  playAlertChime() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    // 心地よい和音（Cメジャーセブンスコードのような響き）
    // C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), B5 (987.77Hz), C6 (1046.50Hz)
    const chord = [523.25, 659.25, 783.99, 987.77, 1046.50];
    const delays = [0, 0.08, 0.16, 0.24, 0.32]; // アルペジオ（ばらして鳴らす）
    
    chord.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // 倍音を少し柔らかくするサイン波
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delays[index]);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, now);

      // エンベロープの設定（アタックは早く、リリースは長く）
      const startTime = now + delays[index];
      const duration = 2.5; // 音が消えるまでの時間

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05); // やわらかく立ち上げる
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);
    });
  }
}

export const audioEngine = new AmbientAudioEngine();
