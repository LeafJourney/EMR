"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/ui/ornament";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, Copy, Check, Mail, Share2 } from "lucide-react";

export default function ReferPage() {
  const [copied, setCopied] = useState(false);
  const referralCode = "LEAF-J9K2M4";
  const referralLink = `https://theleafmart.com/invite/${referralCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />

      <main className="max-w-[1000px] mx-auto px-6 lg:px-12 pt-20 pb-28">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[var(--accent)]/10 text-[var(--accent)] mb-6">
            <Gift className="w-10 h-10" />
          </div>
          <Eyebrow className="justify-center mb-4 text-[var(--accent)]">Share the Wellness</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-text leading-[1.1] tracking-tight mb-6">
            Give $20, Get $20
          </h1>
          <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
            Invite your friends to Leafmart. They get $20 off their first order of $50 or more, and you get $20 in store credit when their order ships.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          {/* Share Box */}
          <Card tone="raised" className="border-[var(--border)] overflow-hidden">
            <CardContent className="p-8 sm:p-10">
              <h3 className="font-display text-2xl text-text mb-2">Your Unique Link</h3>
              <p className="text-sm text-text-muted mb-8">
                Share this link directly with friends or post it on your social channels.
              </p>

              <div className="flex items-center gap-3 p-3 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] mb-8">
                <code className="flex-1 text-sm font-mono text-text overflow-hidden text-ellipsis whitespace-nowrap pl-2">
                  {referralLink}
                </code>
                <Button variant="secondary" size="sm" onClick={copyToClipboard} className="shrink-0 rounded-lg">
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button variant="secondary" className="w-full flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" /> Email
                </Button>
                <Button variant="secondary" className="w-full flex items-center justify-center gap-2">
                  <Share2 className="w-4 h-4" /> Share
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <div>
            <h3 className="font-display text-2xl text-text mb-8">How it works</h3>
            
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--surface-muted)] text-[var(--accent)] flex items-center justify-center font-display text-lg font-medium">
                  1
                </div>
                <div>
                  <h4 className="text-lg font-medium text-text mb-1">Share your link</h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Send your invite link to friends who haven't shopped at Leafmart before.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--surface-muted)] text-[var(--accent)] flex items-center justify-center font-display text-lg font-medium">
                  2
                </div>
                <div>
                  <h4 className="text-lg font-medium text-text mb-1">They get $20</h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Your friends receive an automatic $20 discount applied at checkout on their first order over $50.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--surface-muted)] text-[var(--accent)] flex items-center justify-center font-display text-lg font-medium">
                  3
                </div>
                <div>
                  <h4 className="text-lg font-medium text-text mb-1">You get $20</h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Once their order ships, we'll automatically add $20 in store credit to your Leafmart account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
