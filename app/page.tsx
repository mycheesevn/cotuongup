import { CotuongupGame } from "@/components/cotuongup/CotuongupGame";
import { AuthProvider } from "@/lib/supabase/AuthContext";

export default function Page() {
  return (
    <AuthProvider>
      <CotuongupGame />
    </AuthProvider>
  );
}
