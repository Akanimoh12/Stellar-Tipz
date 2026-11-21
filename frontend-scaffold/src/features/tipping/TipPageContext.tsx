import { MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "@/components/ui/Card";
import RecentTips from "./RecentTips";

const TipPageContext = ({ address }: { address: string }) => (
  <section
    role="region"
    aria-label="Tipping context and recent activity"
    className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]"
  >
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <MessageSquare size={18} />
        <h2 className="text-xl font-black uppercase">
          Why supporters tip here
        </h2>
      </div>
      <ul className="space-y-3 text-sm font-medium leading-6 text-gray-700">
        <li>
          Tips settle quickly on Stellar and creators keep the majority of every
          payment.
        </li>
        <li>
          Every profile has a visible reputation signal through the on-chain
          credit score.
        </li>
        <li>
          Supporters can pair value with a message, making each tip feel
          personal.
        </li>
      </ul>
      <Link
        to="/leaderboard"
        className="inline-flex text-sm font-black uppercase underline"
      >
        Explore the leaderboard
      </Link>
    </Card>
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black uppercase">Recent activity</h2>
        <Link
          to="/dashboard"
          className="text-sm font-black uppercase underline"
        >
          View dashboard
        </Link>
      </div>
      <RecentTips address={address} />
    </Card>
  </section>
);

export default TipPageContext;
