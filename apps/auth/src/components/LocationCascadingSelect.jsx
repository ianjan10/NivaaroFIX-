import React, { useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { indianStatesAndCitiesData } from '../data/indianStatesAndCitiesData';

export default function LocationCascadingSelect({
  state,
  city,
  selectedState,
  selectedCity,
  onStateChange,
  onCityChange,
  onComplete,
  required = false
}) {
  const { t } = useLanguage();
  const cityRef = useRef(null);

  const activeState = selectedState !== undefined ? (selectedState || '') : (state || '');
  const activeCity = selectedCity !== undefined ? (selectedCity || '') : (city || '');

  const statesList = Object.keys(indianStatesAndCitiesData).sort();
  let citiesList = activeState && indianStatesAndCitiesData[activeState] ? [...indianStatesAndCitiesData[activeState]] : [];

  // If GPS or previous value detected a city/district not yet in the static list, include it
  if (activeCity && !citiesList.includes(activeCity)) {
    citiesList = [activeCity, ...citiesList];
  }

  const handleStateSelect = (e) => {
    const nextState = e.target.value;
    if (onStateChange) onStateChange(nextState);
    if (nextState && cityRef.current) {
      cityRef.current.focus();
    }
  };

  const handleCitySelect = (e) => {
    const nextCity = e.target.value;
    if (onCityChange) onCityChange(nextCity);
    if (activeState && nextCity && onComplete) {
      onComplete({ state: activeState, city: nextCity });
    }
  };

  return (
    <div className="input-row-grid">
      <div className="input-group">
        <label>{t.stateLabel || 'State / UT'}</label>
        <select
          className="input-select"
          value={activeState}
          onChange={handleStateSelect}
          required={required}
        >
          <option value="">{t.selectStatePlaceholder || 'Select State'}</option>
          {statesList.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label>{t.cityLabel || 'City / District'}</label>
        <select
          ref={cityRef}
          className="input-select"
          value={activeCity}
          onChange={handleCitySelect}
          disabled={!activeState}
          required={required}
        >
          <option value="">
            {activeState ? (t.selectCityPlaceholder || 'Select City / District') : (t.selectStateFirst || 'Select State first')}
          </option>
          {citiesList.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
