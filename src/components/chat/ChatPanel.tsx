"use client";

import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";

export function ChatPanel() {
  return (
    <>
      <ChatTranscript />
      <ChatComposer />
    </>
  );
}
