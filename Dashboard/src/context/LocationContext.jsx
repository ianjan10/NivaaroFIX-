import React, { createContext, useContext, useState, useEffect } from 'react';
import { popularIndianCities } from '../data/indianCitiesData';

const LocationContext = createContext();

export function LocationProvider({ children }) {
  const [selectedCity, setSelectedCity] = useState(() => {
    const saved = localStorage.getItem('nivaaro-city');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.name) {
          return parsed;
        }
        if (typeof parsed === 'string') {
          const found = popularIndianCities.find(c => c.name.toLowerCase() === parsed.toLowerCase() || c.id === parsed.toLowerCase());
          if (found) return found;
        }
      } catch (e) {
        // Fallback
      }
    }
    return popularIndianCities[0]; // Delhi NCR default
  });

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('nivaaro-city', JSON.stringify(selectedCity));
  }, [selectedCity]);

  const selectCity = (city) => {
    setSelectedCity(city);
    setIsLocationModalOpen(false);
  };

  return (
    <LocationContext.Provider
      value={{
        selectedCity,
        selectCity,
        isLocationModalOpen,
        setIsLocationModalOpen,
        allCities: popularIndianCities
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    return {
      selectedCity: popularIndianCities[0],
      selectCity: () => {},
      isLocationModalOpen: false,
      setIsLocationModalOpen: () => {},
      allCities: popularIndianCities
    };
  }
  return context;
}
