import React from 'react';
import CustomerForgotPasswordPage from './CustomerForgotPasswordPage';

export default function AgentForgotPasswordPage({ onBackToSignIn }) {
  return <CustomerForgotPasswordPage isAgent={true} onBackToSignIn={onBackToSignIn} />;
}
