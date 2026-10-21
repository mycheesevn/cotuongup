import { LegalPage } from "@/components/cotuongup/LegalPage";
import { PRIVACY } from "@/lib/jieqi/legal";

export const metadata = {
  title: "Privacy Policy — Cờ Úp (Dark Xiangqi)",
};

export default function Privacy() {
  return <LegalPage docs={PRIVACY} />;
}
