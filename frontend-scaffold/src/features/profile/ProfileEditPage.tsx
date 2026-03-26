import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';

const ProfileEditPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="py-16 px-4 text-center">
      <h1 className="text-4xl font-black mb-4">Edit Profile</h1>
      <p className="text-gray-600 mb-8">Profile editing — coming soon.</p>
      <Button variant="outline" onClick={() => navigate('/profile')}>
        Back to Profile
      </Button>
    </div>
  );
};

export default ProfileEditPage;
