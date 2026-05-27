import React from "react";
import { Code2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ErrorState from "../../components/shared/ErrorState";
import Loader from "../../components/ui/Loader";
import EmptyState from "../../components/ui/EmptyState";
import { useProfile } from "../../hooks/useProfile";
import { usePageTitle } from "../../hooks/usePageTitle";
import { categorizeError } from "../../helpers/error";
import EmbedCodeGenerator from "../profile/EmbedCodeGenerator";

const EmbedGeneratorPage: React.FC = () => {
  const { profile, loading, error, isRegistered, refetch } = useProfile();
  const navigate = useNavigate();

  usePageTitle(profile ? `Embed Widget — @${profile.username}` : "Embed Widget");

  if (loading) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader size="lg" text="Loading profile…" />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState category={categorizeError(error).category} onRetry={refetch} />
      </PageContainer>
    );
  }

  if (!isRegistered || !profile) {
    return (
      <PageContainer maxWidth="xl" className="space-y-8 py-10">
        <EmptyState
          icon={<Code2 />}
          title="No profile yet"
          description="Register a creator profile first, then come back to generate your embed widget."
        />
        <div className="flex justify-center">
          <Button variant="primary" onClick={() => navigate("/register")}>
            Register now
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section aria-labelledby="embed-heading">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-600 mb-2">
          Creator tools
        </p>
        <h1
          id="embed-heading"
          className="flex items-center gap-3 text-4xl font-black uppercase mb-2"
        >
          <Code2 size={32} />
          Embed widget
        </h1>
        <p className="text-base text-gray-700 max-w-xl leading-7">
          Generate an embeddable tipping widget for your external website, blog, or social profile. Customise the theme, size, and preset amounts.
        </p>
      </section>

      <Card padding="lg" className="border-4 shadow-brutalist">
        <EmbedCodeGenerator username={profile.username} />
      </Card>
    </PageContainer>
  );
};

export default EmbedGeneratorPage;
