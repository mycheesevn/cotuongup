"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { detectLang, type Lang } from "@/lib/jieqi/i18n";
import type { LegalDoc } from "@/lib/jieqi/legal";

interface Props {
  docs: Record<Lang, LegalDoc>;
}

export function LegalPage({ docs }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang(detectLang());
    document.documentElement.lang = detectLang();
  }, []);
  const doc = docs[lang];
  return (
    <div className="cu-legal-page">
      <article className="cu-legal">
        <Link href="/" className="cu-btn">
          {doc.back}
        </Link>
        <h1>{doc.title}</h1>
        <p className="cu-legal-updated">{doc.updated}</p>
        {doc.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {doc.sections.map((s, i) => (
          <section key={i}>
            <h2>{s.heading}</h2>
            {s.body.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </section>
        ))}
        <div className="cu-legal-foot">
          <Link href="/" className="cu-btn">
            {doc.back}
          </Link>
        </div>
      </article>
    </div>
  );
}
