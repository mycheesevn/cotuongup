import { LegalPage } from "@/components/cotuongup/LegalPage";
import { DATA_DELETION } from "@/lib/jieqi/legal";

export const metadata = {
  title: "User Data Deletion — Cờ Úp (Dark Xiangqi)",
};

export default function DataDeletion() {
  return <LegalPage docs={DATA_DELETION} />;
}
