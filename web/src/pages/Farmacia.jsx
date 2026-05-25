import DashPageHeader from "../components/DashPageHeader";
import FarmaciaSolum from "../components/farmacia/FarmaciaSolum";
import { supabase } from "../lib/supabase";

export default function Farmacia({ profile, session }) {
  const userMq = profile?.superficie_mq ?? 150;

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="page dashboard dashboard--farmacia">
      <DashPageHeader active="farmacia" profile={profile} onLogout={logout} />
      <section className="dash-farmacia px-4 sm:px-6 pb-12 pt-4">
        <FarmaciaSolum userMq={userMq} />
      </section>
    </div>
  );
}
