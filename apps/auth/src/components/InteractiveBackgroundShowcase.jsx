import React, { useState, useEffect, useRef } from 'react';
import '../styles/InteractiveBackgroundShowcase.css';

const projectAssets = [
  {
    id: 1,
    src: '/project_image/5.png',
    title: 'Master Electrician: MCB & Board Service',
    category: 'photos'
  },
  {
    id: 2,
    src: '/project_image/6.png',
    title: 'Master Plumber: Washbasin & Pipe Fix',
    category: 'photos'
  },
  {
    id: 3,
    src: '/project_image/7.png',
    title: 'Certified Electrician: Fixture Fitting',
    category: 'photos'
  },
  {
    id: 4,
    src: '/project_image/8.png',
    title: 'Master Plumber: Sanitation & Drainage',
    category: 'photos'
  },
  {
    id: 5,
    src: '/project_image/1.png',
    title: 'Customer Authentication Spec',
    category: 'specs'
  },
  {
    id: 6,
    src: '/project_image/2.png',
    title: 'Professional Portal Spec',
    category: 'specs'
  },
  {
    id: 7,
    src: '/project_image/3.png',
    title: 'Marketplace & Service Catalog',
    category: 'specs'
  },
  {
    id: 8,
    src: '/project_image/4.png',
    title: 'Live Dispatcher & Professional Console',
    category: 'specs'
  }
];

const AUTO_SCROLL_INTERVAL = 3500; // 3.5 seconds auto-cycle

export default function InteractiveBackgroundShowcase() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef(null);

  // Auto-scroll cycle every 3.5 seconds
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % projectAssets.length);
    }, AUTO_SCROLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="bg-showcase-fullscreen mode-vivid" aria-hidden="true">
      {/* Render all background photo layers for smooth crossfade */}
      <div className="bg-slideshow-track">
        {projectAssets.map((asset, idx) => {
          const isActive = idx === currentIndex;
          const isPrev = idx === (currentIndex - 1 + projectAssets.length) % projectAssets.length;
          return (
            <div
              key={asset.id}
              className={`bg-slide-layer ${isActive ? 'active' : isPrev ? 'prev' : ''}`}
            >
              <img
                src={asset.src}
                alt={asset.title}
                className="bg-slide-image"
                loading={idx < 2 ? 'eager' : 'lazy'}
              />
            </div>
          );
        })}
      </div>

      {/* Master Multi-Layer Editorial Vignette & Contrast Mask */}
      <div className="bg-editorial-vignette" />
      <div className="bg-mesh-texture" />
    </div>
  );
}
