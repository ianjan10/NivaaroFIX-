import React from 'react';
import HeroSearchSection from '../components/HeroSearchSection';
import WhyNivaaroSection from '../components/WhyNivaaroSection';
import ServicesPreviewSection from '../components/ServicesPreviewSection';
import HowItWorksSection from '../components/HowItWorksSection';
import BrandStatementAndCtaSection from '../components/BrandStatementAndCtaSection';
import PublishedFeedbackSection from '../components/PublishedFeedbackSection';
import AppFooter from '../components/AppFooter';
import ScrollRevealSection from '../components/ScrollRevealSection';

export default function HomePage({
  onNavigateToServices,
  onNavigateToPartner,
  onNavigateToAbout,
  onNavigateToBookings,
  onOpenAuth,
  user,
  agent,
  onLogoutUser,
  onLogoutAgent
}) {
  return (
    <div className="home-page-view">
      {/* 1. Hero Search Section */}
      <HeroSearchSection
        onNavigateToServices={onNavigateToServices}
        currentUser={user}
        onOpenAuth={onOpenAuth}
      />

      {/* 2. Why NivaaroFix (Editorial Principles: Verification, Clarity, Accountability) */}
      <ScrollRevealSection as="section">
        <WhyNivaaroSection />
      </ScrollRevealSection>

      {/* 3. Services Preview (Restrained: Electrician & Plumber) */}
      <ScrollRevealSection as="section">
        <ServicesPreviewSection
          onSelectCategory={onNavigateToServices}
          onExploreServices={onNavigateToServices}
        />
      </ScrollRevealSection>

      {/* 4. How It Works (3 Steps: Tell us, Find service, Book) */}
      <ScrollRevealSection as="section">
        <HowItWorksSection />
      </ScrollRevealSection>

      {/* 5. Quiet Brand Statement & Final Editorial CTA */}
      <ScrollRevealSection as="section">
        <BrandStatementAndCtaSection
          onNavigateToServices={onNavigateToServices}
          currentUser={user}
          onOpenAuth={onOpenAuth}
        />
      </ScrollRevealSection>

      {/* 6. Published Feedback Testimonials ("In Their Words") — Appears only when published */}
      <PublishedFeedbackSection />

      {/* 7. Footer (Multi-Column Grid, Understated & Truthful) */}
      <AppFooter
        currentPortal="customer"
        user={user}
        agent={agent}
        onNavigateHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onNavigateServices={onNavigateToServices}
        onNavigateAbout={onNavigateToAbout}
        onNavigateBookings={onNavigateToBookings}
        onOpenAuth={onOpenAuth}
        onSwitchPortal={onNavigateToPartner}
        onLogoutUser={onLogoutUser}
        onLogoutAgent={onLogoutAgent}
      />
    </div>
  );
}
