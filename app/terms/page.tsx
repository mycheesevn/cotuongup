import { LegalPage } from "@/components/cotuongup/LegalPage";
import { TERMS } from "@/lib/jieqi/legal";

export const metadata = {
  title: "Terms of Service — Cờ Úp (Dark Xiangqi)",
};

export default function Terms() {
  return <LegalPage docs={TERMS} />;
}
