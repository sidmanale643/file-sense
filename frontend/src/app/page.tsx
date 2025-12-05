"use client";

import { useCallback, useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import styles from "./page.module.css";

export default function Home() {
  const [isOpen, setIsOpen] = useState(false);
  const handleOpenChange = useCallback((open: boolean) => setIsOpen(open), []);

  const steps = [
    {
      title: "Index instantly",
      body: "Drop in docs, code, or attachments. We hydrate embeddings and metadata so every search is context-rich from the start.",
      tag: "Fast ingest",
    },
    {
      title: "Search like Spotlight",
      body: "Hit ⌘/Ctrl + K to summon the palette. Results blend keyword and semantic cues, ordered to feel human-smart.",
      tag: "Keyboard-first",
    },
    {
      title: "Open with confidence",
      body: "Preview paths, copy locations, or jump straight to the file. Swap in your API and keep the UX exactly as-is.",
      tag: "Ready to wire",
    },
  ];

  const faqs = [
    {
      q: "Can I plug in my own data source?",
      a: "Yes. The UI is decoupled from the data layer—replace the stubbed RAG response with your API, and keep the ranking UI unchanged.",
    },
    {
      q: "Does it work for large repos?",
      a: "The palette is optimized for quick keystroke navigation. Pair it with your chunking + vector strategy, and results stay responsive.",
    },
    {
      q: "How do I trigger it?",
      a: "Use ⌘/Ctrl + K. You can also toggle the command palette programmatically via the exposed `onOpenChange` handler.",
    },
  ];

  return (
    <main className={styles.shell}>
      <div className={styles.logoMark} aria-hidden="true">
        File Sense
      </div>
      <section className={styles.hero}>
        <div className={styles.bgTitle} aria-hidden="true">
          File Sense
        </div>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.pill}>
          <span className={styles.dot} />
          File Sense · Spotlight search
        </div>
        <h1>
          Find the right file in{" "}
          <span className={styles.textGradient}>a few keystrokes</span>.
        </h1>
        <p className={styles.lede}>
          Keyboard-first search that feels instant. Hybrid ranking pulls from docs, code, and attachments—wired to open
          with ⌘/Ctrl + K so you never leave the flow.
        </p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => setIsOpen(true)}>
            Open the palette
          </button>
          <button className={styles.secondary} type="button" onClick={() => setIsOpen((open) => !open)}>
            Toggle (⌘/Ctrl + K)
          </button>
        </div>
        <div className={styles.metrics}>
          <div>
            <span className={styles.metricLabel}>Latency</span>
            <strong>Sub-150ms</strong>
            <p>Optimized for quick keystrokes and instant feedback.</p>
          </div>
          <div>
            <span className={styles.metricLabel}>Coverage</span>
            <strong>Docs · Code · Attachments</strong>
            <p>Unified view so the best result surfaces first.</p>
          </div>
          <div>
            <span className={styles.metricLabel}>Ready to ship</span>
            <strong>Drop-in UI</strong>
            <p>Swap in your RAG API without rebuilding the front end.</p>
          </div>
        </div>
        <div className={styles.shortcuts}>
          <span className={styles.label}>Shortcut</span>
          <div className={styles.keys}>
            <span className={styles.keycap}>⌘</span>/<span className={styles.keycap}>Ctrl</span>
            <span className={styles.keycap}>+</span>
            <span className={styles.keycap}>K</span>
          </div>
          <span className={styles.subtle}>Navigate with ↑ ↓ · Enter copies the file path · Esc closes</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>How it works</p>
            <h2>Three steps from index to open.</h2>
            <p className={styles.sectionLede}>
              A vibrant command palette that pairs semantic ranking with the shortcuts you already know.
            </p>
          </div>
          <div className={styles.sectionBadge}>Built for flow</div>
        </div>
        <div className={styles.steps}>
          {steps.map((step) => (
            <article key={step.title} className={styles.stepCard}>
              <div className={styles.stepTag}>{step.tag}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>FAQ</p>
            <h2>Answers before you wire it up.</h2>
            <p className={styles.sectionLede}>
              The palette stays flexible—bring your own data layer and keep the experience consistent.
            </p>
          </div>
        </div>
        <div className={styles.faqGrid}>
          {faqs.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <CommandPalette isOpen={isOpen} onOpenChange={handleOpenChange} />
    </main>
  );
}
