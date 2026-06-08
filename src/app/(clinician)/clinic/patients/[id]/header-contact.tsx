"use client";

import { useState, useEffect, useRef } from "react";
import { logCorrespondence } from "./actions";

// EMR-829 — DOB shown as MM-DD-YYYY under the patient name (local format; the
// shared formatDate stays "Mon D, YYYY" everywhere else it's used).
function dobMMDDYYYY(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}-${d.getFullYear()}`;
}

interface HeaderContactProps {
  patientId: string;
  patientName: string;
  dateOfBirth: Date | string | null;
  email: string | null;
  phone: string | null;
}

interface AttachmentFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

export function HeaderContact({
  patientId,
  patientName,
  dateOfBirth,
  email,
  phone,
}: HeaderContactProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  // Email form state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [emailSending, setEmailSending] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Phone Call simulator state
  const [callActive, setCallActive] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [callTranscript, setCallTranscript] = useState<string[]>([]);
  const [callSaving, setCallSaving] = useState(false);
  const callIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-append simulated conversation blocks
  useEffect(() => {
    if (callActive) {
      const dialogue = [
        { time: 0, text: "[Clinician]: Calling patient..." },
        { time: 2, text: "System: Call connected." },
        {
          time: 5,
          text: `[Clinician]: Hello, ${patientName.split(" ")[0]}? This is your care provider calling to check on your recent dosage logs.`,
        },
        {
          time: 10,
          text: "[Patient]: Yes, speaking! Hi doctor. The CBD oil regimen has been helping my sleep a lot, but I feel slightly sluggish in the mornings.",
        },
        {
          time: 16,
          text: "[Clinician]: Understood. Let's adjust the timing to take it 1 hour earlier in the evening, and we'll keep the dose same at 15mg.",
        },
        { time: 22, text: "[Patient]: Perfect, I will start doing that tonight. Thank you!" },
        { time: 26, text: "[Clinician]: Excellent. Let me log this change in your chart. Call me if you need anything else." },
        { time: 30, text: "System: Call ended by provider." },
      ];

      callIntervalRef.current = setInterval(() => {
        setCallTimer((prev) => {
          const nextTime = prev + 1;
          const match = dialogue.find((d) => d.time === nextTime);
          if (match) {
            setCallTranscript((trans) => [...trans, match.text]);
          }
          if (nextTime >= 30) {
            setCallActive(false);
            if (callIntervalRef.current) clearInterval(callIntervalRef.current);
          }
          return nextTime;
        });
      }, 1000);
    } else {
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    }

    return () => {
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    };
  }, [callActive, patientName]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      await processFiles(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files);
      await processFiles(files);
    }
  };

  const processFiles = async (files: File[]) => {
    const loaded: AttachmentFile[] = [];
    for (const file of files) {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;
      loaded.push({
        name: file.name,
        type: file.type,
        size: file.size,
        base64,
      });
    }
    setAttachments((prev) => [...prev, ...loaded]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSendEmail = async () => {
    if (!subject || !message) {
      alert("Please fill in both subject and message.");
      return;
    }
    setEmailSending(true);
    try {
      await logCorrespondence(patientId, "email", subject, message, attachments);
      setSubject("");
      setMessage("");
      setAttachments([]);
      setEmailOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to send correspondence.");
    } finally {
      setEmailSending(false);
    }
  };

  const startPhoneCall = () => {
    setCallTranscript(["System: Dialing patient..."]);
    setCallTimer(0);
    setCallActive(true);
  };

  const handleSavePhoneCall = async () => {
    setCallSaving(true);
    try {
      const text = callTranscript.join("\n");
      await logCorrespondence(patientId, "call", "", text);
      setPhoneOpen(false);
      setCallTranscript([]);
      setCallTimer(0);
    } catch (err) {
      console.error(err);
      alert("Failed to save call log.");
    } finally {
      setCallSaving(false);
    }
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mt-3">
      <span className="text-xs text-text-subtle">
        DOB {dateOfBirth ? dobMMDDYYYY(new Date(dateOfBirth)) : "Not on file"}
      </span>
      <span className="text-xs text-text-subtle">&middot;</span>
      {email ? (
        <button
          type="button"
          onClick={() => setEmailOpen(true)}
          className="text-xs text-text-subtle hover:text-accent hover:underline flex items-center gap-1 focus:outline-none"
        >
          <span className="text-accent">✉</span>
          <span>{email}</span>
        </button>
      ) : (
        <span className="text-xs text-text-subtle italic">No email on file</span>
      )}
      <span className="text-xs text-text-subtle">&middot;</span>
      {phone ? (
        <button
          type="button"
          onClick={() => {
            setPhoneOpen(true);
            startPhoneCall();
          }}
          className="text-xs text-text-subtle hover:text-accent hover:underline flex items-center gap-1 focus:outline-none"
        >
          <span className="text-emerald-600">📞</span>
          <span>{phone}</span>
        </button>
      ) : (
        <span className="text-xs text-text-subtle italic">No phone on file</span>
      )}

      {/* ── EMAIL DIALER MODAL ────────────────────────────────── */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface rounded-xl border border-border shadow-2xl p-6 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
              <h3 className="font-display text-lg font-semibold text-text">
                Send Correspondence to {patientName}
              </h3>
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="text-text-subtle hover:text-text text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-text-subtle uppercase tracking-wider mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anxiety dosage instructions follow-up"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-subtle uppercase tracking-wider mb-1">
                  Message
                </label>
                <textarea
                  rows={6}
                  placeholder="Write message to patient..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full text-sm rounded-md border border-border bg-surface p-3 text-text focus:outline-none focus:border-accent resize-y"
                />
              </div>

              {/* Drag and Drop Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-text-subtle uppercase tracking-wider mb-1">
                  Attachments
                </label>
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 cursor-pointer ${
                    dragActive
                      ? "border-accent bg-accent/5"
                      : "border-border-strong/60 hover:bg-surface-muted"
                  }`}
                  onClick={() => document.getElementById("file-attach-input")?.click()}
                >
                  <input
                    id="file-attach-input"
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <p className="text-xs text-text-subtle">
                    Drag &amp; drop files here, or{" "}
                    <span className="text-accent hover:underline font-medium">browse</span>
                  </p>
                  <p className="text-[10px] text-text-subtle/80 mt-1">
                    Supports .JPG, .PDF, .DOC (Max 5MB each)
                  </p>
                </div>

                {attachments.length > 0 && (
                  <ul className="mt-3 divide-y divide-border/40 border border-border/60 rounded-md bg-surface-muted text-xs">
                    {attachments.map((att, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between px-3 py-2 hover:bg-surface-raised"
                      >
                        <span className="truncate text-text font-medium max-w-[80%]">
                          {att.name} ({Math.round(att.size / 1024)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(i);
                          }}
                          className="text-red-500 hover:text-red-700 font-bold"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border/60 mt-4">
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-surface-muted text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={emailSending}
                onClick={handleSendEmail}
                className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-md hover:bg-accent-strong disabled:opacity-50"
              >
                {emailSending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHONE CALL SIMULATOR MODAL ───────────────────────── */}
      {phoneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface-raised rounded-xl border border-border shadow-2xl overflow-hidden">
            {/* Call Header */}
            <div className="bg-slate-900 text-white p-6 text-center space-y-2">
              <div className="flex justify-center">
                <div className="h-16 w-16 bg-slate-800 rounded-full flex items-center justify-center ring-4 ring-emerald-500/20">
                  <span className="text-3xl text-emerald-400">📞</span>
                </div>
              </div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                Call with {patientName}
              </h3>
              <p className="text-xs text-slate-400 tracking-wider">
                {phone} &middot; CLINIC LINE SIMULATOR
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    callActive ? "bg-red-500 animate-ping" : "bg-slate-500"
                  }`}
                />
                <span className="font-mono text-sm tracking-widest text-slate-300">
                  {formatTimer(callTimer)}
                </span>
              </div>
            </div>

            {/* Live Waveform Indicator (animated decibel bar) */}
            <div className="bg-slate-950 px-6 py-3 border-y border-slate-800 flex items-center justify-center gap-1.5 h-12">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((bar) => {
                const randomAnim = callActive
                  ? `animation-delay-${bar % 4} animate-pulse`
                  : "";
                const height = callActive ? Math.floor(Math.random() * 30) + 10 : 8;
                return (
                  <div
                    key={bar}
                    className={`w-1 rounded-full bg-emerald-500 transition-all duration-150 ${randomAnim}`}
                    style={{ height: `${height}px` }}
                  />
                );
              })}
            </div>

            {/* Real-time Transcription panel */}
            <div className="p-6 bg-surface-muted h-64 overflow-y-auto space-y-2 border-b border-border/60">
              <p className="text-[10px] text-text-subtle uppercase tracking-wider font-semibold border-b border-border pb-1.5 mb-2">
                Real-time Call Transcript
              </p>
              {callTranscript.map((line, idx) => {
                const isClinician = line.startsWith("[Clinician]");
                const isSystem = line.startsWith("System") || line.startsWith("System:");
                let textClass = "text-text";
                if (isClinician) textClass = "text-accent font-medium";
                else if (isSystem) textClass = "text-text-subtle italic";
                else textClass = "text-emerald-700 dark:text-emerald-400 font-medium";

                return (
                  <p key={idx} className={`text-xs leading-relaxed ${textClass}`}>
                    {line}
                  </p>
                );
              })}
            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-surface flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const text = callTranscript.join("\n");
                  navigator.clipboard.writeText(text);
                  alert("Transcript copied to clipboard!");
                }}
                className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-surface-muted text-text font-medium"
              >
                Copy transcript
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneOpen(false);
                    setCallActive(false);
                    if (callIntervalRef.current) clearInterval(callIntervalRef.current);
                  }}
                  className="px-4 py-2 text-xs border border-border rounded-md hover:bg-surface-muted text-text"
                >
                  Discard call
                </button>
                <button
                  type="button"
                  disabled={callActive || callSaving}
                  onClick={handleSavePhoneCall}
                  className="px-4 py-2 text-xs bg-accent text-accent-ink rounded-md hover:bg-accent-strong disabled:opacity-50 font-semibold"
                  title={callActive ? "Wait for call to complete or disconnect before saving." : ""}
                >
                  {callSaving ? "Saving..." : "Log to correspondence"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
