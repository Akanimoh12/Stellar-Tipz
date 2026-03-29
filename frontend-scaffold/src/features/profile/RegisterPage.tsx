import React from 'react';
import RegisterForm from './RegisterForm';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

const RegisterPage: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="py-16 px-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-4xl font-black mb-2">Create Your Profile</h1>
          <p className="text-gray-600 mb-10">
            Register once on-chain. Supporters will find you at tipz.app/@you.
          </p>
          <RegisterForm />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default RegisterPage;
