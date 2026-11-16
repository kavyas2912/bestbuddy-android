// vce-core/src/voice.rs
//! Voice loop glue (v0.4): capture frames -> VAD segmentation -> ASR -> (engine) -> TTS -> playback, with barge-in.
//! sherpa-onnx (Silero VAD, ASR, TTS) plugs in by implementing `Vad`, `Asr`, `Tts`; `EnergyVad` is a built-in fallback.
//! NOTE: on a real phone, capture must use an echo-cancelling source, or Buddy's own speech will trigger barge-in.
use crate::platform::{AudioIo, Result};

pub trait Vad: Send {
    fn is_speech(&mut self, frame: &[i16]) -> bool;
}
pub trait Asr: Send {
    fn transcribe(&mut self, pcm: &[i16], rate: u32) -> Result<String>;
}
pub trait Tts: Send {
    fn synth(&mut self, text: &str) -> Result<(Vec<i16>, u32)>;
}

pub struct EnergyVad {
    pub threshold: f32,
}
impl Vad for EnergyVad {
    fn is_speech(&mut self, f: &[i16]) -> bool {
        if f.is_empty() {
            return false;
        }
        let e = f.iter().map(|&s| (s as f32).powi(2)).sum::<f32>() / f.len() as f32;
        e.sqrt() > self.threshold
    }
}

#[derive(Debug, PartialEq)]
pub enum VoiceEvent {
    SpeechStart,
    Heard(String),
    Interrupted,
    Failed(String),
}

pub struct VoicePipeline {
    vad: Box<dyn Vad>,
    asr: Box<dyn Asr>,
    tts: Box<dyn Tts>,
    rate: u32,
    buf: Vec<i16>,
    in_speech: bool,
    quiet: u32,
    hang: u32,
    speaking: bool,
}

impl VoicePipeline {
    /// `hang_frames`: consecutive non-speech frames that end an utterance.
    pub fn new(
        vad: Box<dyn Vad>,
        asr: Box<dyn Asr>,
        tts: Box<dyn Tts>,
        rate: u32,
        hang_frames: u32,
    ) -> Self {
        Self {
            vad,
            asr,
            tts,
            rate,
            buf: vec![],
            in_speech: false,
            quiet: 0,
            hang: hang_frames,
            speaking: false,
        }
    }
    pub fn is_speaking(&self) -> bool {
        self.speaking
    }

    /// Feed one capture frame; returns events (barge-in, start of speech, finished transcript).
    pub fn on_frame(&mut self, frame: &[i16], audio: &dyn AudioIo) -> Vec<VoiceEvent> {
        let mut ev = vec![];
        if self.vad.is_speech(frame) {
            if self.speaking {
                self.speaking = false;
                audio.stop_playback();
                ev.push(VoiceEvent::Interrupted);
            }
            if !self.in_speech {
                self.in_speech = true;
                ev.push(VoiceEvent::SpeechStart);
            }
            self.quiet = 0;
            self.buf.extend_from_slice(frame);
        } else if self.in_speech {
            self.buf.extend_from_slice(frame);
            self.quiet += 1;
            if self.quiet >= self.hang {
                let pcm = std::mem::take(&mut self.buf);
                self.in_speech = false;
                self.quiet = 0;
                match self.asr.transcribe(&pcm, self.rate) {
                    Ok(t) if !t.trim().is_empty() => ev.push(VoiceEvent::Heard(t)),
                    Ok(_) => {}
                    Err(e) => ev.push(VoiceEvent::Failed(e)),
                }
            }
        }
        ev
    }
    pub fn say(&mut self, text: &str, audio: &dyn AudioIo) -> Result<()> {
        let (pcm, rate) = self.tts.synth(text)?;
        self.speaking = true;
        audio.play_pcm(&pcm, rate)
    }
    pub fn playback_finished(&mut self) {
        self.speaking = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{CaptureCfg, FrameSink};
    use std::sync::Mutex;
    struct LoudVad;
    impl Vad for LoudVad {
        fn is_speech(&mut self, f: &[i16]) -> bool {
            f[0].abs() > 1000
        }
    }
    struct FakeAsr;
    impl Asr for FakeAsr {
        fn transcribe(&mut self, pcm: &[i16], _: u32) -> Result<String> {
            Ok(format!("heard {} samples", pcm.len()))
        }
    }
    struct FakeTts;
    impl Tts for FakeTts {
        fn synth(&mut self, t: &str) -> Result<(Vec<i16>, u32)> {
            Ok((vec![0; t.len()], 16000))
        }
    }
    #[derive(Default)]
    struct Rec(Mutex<Vec<&'static str>>);
    impl AudioIo for Rec {
        fn start_capture(&self, _: CaptureCfg, _: FrameSink) -> Result<()> {
            Ok(())
        }
        fn stop_capture(&self) {}
        fn play_pcm(&self, _: &[i16], _: u32) -> Result<()> {
            self.0.lock().unwrap().push("play");
            Ok(())
        }
        fn stop_playback(&self) {
            self.0.lock().unwrap().push("stop");
        }
    }
    fn pipe() -> VoicePipeline {
        VoicePipeline::new(
            Box::new(LoudVad),
            Box::new(FakeAsr),
            Box::new(FakeTts),
            16000,
            3,
        )
    }

    #[test]
    fn segments_an_utterance_after_hangover() {
        let (mut p, a) = (pipe(), Rec::default());
        let (loud, quiet) = ([5000i16; 4], [0i16; 4]);
        assert!(p.on_frame(&quiet, &a).is_empty());
        assert_eq!(p.on_frame(&loud, &a), vec![VoiceEvent::SpeechStart]);
        p.on_frame(&loud, &a);
        assert!(p.on_frame(&quiet, &a).is_empty() && p.on_frame(&quiet, &a).is_empty());
        assert_eq!(
            p.on_frame(&quiet, &a),
            vec![VoiceEvent::Heard("heard 20 samples".into())]
        );
    }
    #[test]
    fn barge_in_stops_playback() {
        let (mut p, a) = (pipe(), Rec::default());
        p.say("hello there", &a).unwrap();
        assert!(p.is_speaking());
        let ev = p.on_frame(&[5000i16; 4], &a);
        assert_eq!(ev, vec![VoiceEvent::Interrupted, VoiceEvent::SpeechStart]);
        assert!(!p.is_speaking());
        assert_eq!(*a.0.lock().unwrap(), vec!["play", "stop"]);
    }
    #[test]
    fn energy_vad_detects_loud_frames() {
        let mut v = EnergyVad { threshold: 500.0 };
        assert!(v.is_speech(&[3000; 10]) && !v.is_speech(&[10; 10]) && !v.is_speech(&[]));
    }
}
