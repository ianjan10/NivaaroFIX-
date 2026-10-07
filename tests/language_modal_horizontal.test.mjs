import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Language Modal Horizontal Layout Verification', () => {
  const dashCssPath = path.resolve(__dirname, '../Dashboard/src/styles/dashboardDesignSystem.css');
  const webloginCssPath = path.resolve(__dirname, '../WebLogin/src/styles/designSystem.css');

  const dashCss = fs.readFileSync(dashCssPath, 'utf8');
  const webCss = fs.readFileSync(webloginCssPath, 'utf8');

  it('Dashboard language modal card is horizontal (max-width >= 960px)', () => {
    assert.ok(
      dashCss.includes('max-width: 960px'),
      'Dashboard modal card must have max-width: 960px for horizontal landscape layout'
    );
  });

  it('Dashboard language grid has 5 columns (repeat(5, 1fr)) and no max-height scrollbar', () => {
    assert.ok(
      dashCss.includes('grid-template-columns: repeat(5, 1fr)'),
      'Dashboard language grid must use repeat(5, 1fr) for horizontal layout'
    );
    assert.ok(
      dashCss.includes('max-height: none') && dashCss.includes('overflow: visible'),
      'Dashboard language grid must not restrict max-height or force overflow-y scroll'
    );
  });

  it('WebLogin language modal card is horizontal (max-width >= 960px)', () => {
    assert.ok(
      webCss.includes('max-width: 960px'),
      'WebLogin modal card must have max-width: 960px for horizontal landscape layout'
    );
  });

  it('WebLogin language grid has 5 columns (repeat(5, 1fr)) and no max-height scrollbar', () => {
    assert.ok(
      webCss.includes('grid-template-columns: repeat(5, 1fr)'),
      'WebLogin language grid must use repeat(5, 1fr) for horizontal layout'
    );
    assert.ok(
      webCss.includes('max-height: none') && webCss.includes('overflow: visible'),
      'WebLogin language grid must not restrict max-height or force overflow-y scroll'
    );
  });
});
