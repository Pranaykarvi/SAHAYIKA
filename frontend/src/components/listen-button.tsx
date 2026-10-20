"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// Reads the summary aloud via the Web Speech API. This is a STAND-IN for the
// voice interface the full design specifies (voice-first lessons and
// readouts); it is one button, and the platform must not be described as
// voice-first anywhere in the UI.
export function ListenButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" && "speechSynthesis" in window,
    );
  }, []);

  if (!supported) return null;

  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full text-base"
      onClick={toggle}
    >
      {speaking ? "Stop reading" : "🔊 Read this aloud"}
    </Button>
  );
}
