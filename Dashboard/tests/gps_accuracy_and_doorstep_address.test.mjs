import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('GPS Accuracy & Detailed Doorstep Location QA', () => {
  it('InteractiveBookingModal uses zoom=18 and addressdetails=1 for Nominatim reverse-geocoding', () => {
    const modalPath = path.resolve(__dirname, '../src/components/InteractiveBookingModal.jsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(
      content.includes('zoom=18&addressdetails=1'),
      'InteractiveBookingModal must call Nominatim with zoom=18&addressdetails=1 for doorstep precision'
    );
  });

  it('InteractiveBookingModal uses getAccurateBrowserCoordinates with maximumAge: 0 and convergence', () => {
    const modalPath = path.resolve(__dirname, '../src/components/InteractiveBookingModal.jsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(
      content.includes('getAccurateBrowserCoordinates'),
      'InteractiveBookingModal must implement getAccurateBrowserCoordinates'
    );
    assert.ok(
      content.includes('maximumAge: 0'),
      'InteractiveBookingModal must request maximumAge: 0 to avoid serving stale coarse IP locations'
    );
    assert.ok(
      content.includes('watchPosition'),
      'InteractiveBookingModal must use watchPosition for convergence filtering'
    );
  });

  it('InteractiveBookingModal auto-triggers high-accuracy GPS on modal load and step 2 review', () => {
    const modalPath = path.resolve(__dirname, '../src/components/InteractiveBookingModal.jsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(
      content.includes('handleUseCurrentLocation(true)'),
      'InteractiveBookingModal must auto-trigger handleUseCurrentLocation on proceeding to location review'
    );
    assert.ok(
      content.includes('handleAddressFieldClick'),
      'InteractiveBookingModal must have handleAddressFieldClick to auto-fetch address when clicking address area'
    );
  });

  it('PartnerContext uses high accuracy with maximumAge: 0 for dispatch', () => {
    const contextPath = path.resolve(__dirname, '../src/context/PartnerContext.jsx');
    const content = fs.readFileSync(contextPath, 'utf8');

    assert.ok(
      content.includes('maximumAge: 0'),
      'PartnerContext must use maximumAge: 0 to ensure live provider coordinates are accurate'
    );
    assert.ok(
      content.includes('enableHighAccuracy: true'),
      'PartnerContext must enable high accuracy GPS'
    );
  });

  it('gpsLocationService formats detailed doorstep address with premise, street, neighbourhood, city, and state', () => {
    const servicePath = path.resolve(__dirname, '../../WebLogin/src/services/gpsLocationService.js');
    const content = fs.readFileSync(servicePath, 'utf8');

    assert.ok(
      content.includes('formatDetailedDoorstepAddress'),
      'gpsLocationService must export formatDetailedDoorstepAddress'
    );
    assert.ok(
      content.includes('zoom=18&addressdetails=1'),
      'gpsLocationService must call Nominatim with zoom=18&addressdetails=1'
    );
    assert.ok(
      content.includes('maximumAge: 0'),
      'gpsLocationService must set maximumAge: 0 for hardware/Wi-Fi positioning'
    );
    assert.ok(
      content.includes('getHighAccuracyCoordinates'),
      'gpsLocationService must export getHighAccuracyCoordinates'
    );
  });

  it('CustomerProfilePage and AgentProfilePage auto-detect GPS on empty address and on click', () => {
    const custProfile = fs.readFileSync(path.resolve(__dirname, '../../WebLogin/src/pages/CustomerProfilePage.jsx'), 'utf8');
    const agentProfile = fs.readFileSync(path.resolve(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx'), 'utf8');

    assert.ok(
      custProfile.includes('handleAutoDetectGps(true)'),
      'CustomerProfilePage must auto-trigger GPS on mount when address is missing'
    );
    assert.ok(
      agentProfile.includes('handleAutoDetectGps(true)'),
      'AgentProfilePage must auto-trigger GPS on mount when address is missing'
    );
    assert.ok(
      custProfile.includes('handleAddressSectionClick'),
      'CustomerProfilePage must trigger auto-detect on clicking address'
    );
    assert.ok(
      agentProfile.includes('handleAddressSectionClick'),
      'AgentProfilePage must trigger auto-detect on clicking address'
    );
  });
});
