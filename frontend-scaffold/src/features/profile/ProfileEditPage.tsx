import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import PageContainer from "../../components/layout/PageContainer";
import Breadcrumbs from "../../components/shared/Breadcrumbs";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Loader from "../../components/ui/Loader";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import ErrorState from "../../components/shared/ErrorState";
import { useProfile } from "../../hooks/useProfile";
import { usePageTitle } from "../../hooks/usePageTitle";
import { categorizeError } from "../../helpers/error";
import EditProfileForm from "./EditProfileForm";
import DomainVerificationSection from "./DomainVerificationSection";

const ProfileEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, loading, error, isRegistered, refetch } = useProfile();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  usePageTitle(
    loading
      ? "Loading Profile..."
      : profile
        ? `Edit ${profile.displayName}`
        : "Edit Profile",
  );

  // Redirect to register if no profile exists after loading completes
  useEffect(() => {
    if (!loading && !isRegistered) {
      navigate("/register", { replace: true });
    }
  }, [loading, isRegistered, navigate]);

  // Warn user about unsaved changes when navigating away
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    },
    [hasUnsavedChanges],
  );

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [handleBeforeUnload]);

  if (loading) {
    return (
      <PageContainer maxWidth="md" className="py-20">
        <div
          data-testid="profile-skeleton"
          className="flex flex-col items-center justify-center gap-4"
        >
          <Loader size="lg" text="Loading profile data..." />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="md" className="py-20">
        <ErrorState
          errorData={categorizeError(error)}
          onRetry={refetch}
        />
      </PageContainer>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <ErrorBoundary>
      <PageContainer maxWidth="md" className="space-y-6 py-10">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Profile", href: "/profile" },
            { label: "Edit Profile" },
          ]}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            icon={<ArrowLeft size={18} />}
          >
            Back to Profile
          </Button>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black uppercase">Edit Profile</h1>
          <p className="text-sm font-bold text-gray-600">
            Update your creator profile details below.
          </p>
        </div>

        <Card padding="lg" className="border-4 shadow-brutalist">
          <EditProfileForm
            profile={profile}
            onDirtyChange={setHasUnsavedChanges}
          />
        </Card>

        <DomainVerificationSection profile={profile} onVerified={refetch} />
      </PageContainer>
    </ErrorBoundary>
  );
};

export default ProfileEditPage;
