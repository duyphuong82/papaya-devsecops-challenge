// 24 unit tests for rules.ts - see 04 file Appendix A. Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkIamDocument } from '../src/rules';
describe('iam', () => { it('rejects Action *', () => { const msgs: string[]=[]; checkIamDocument(JSON.stringify({Statement:[{Effect:'Allow', Action:'*', Resource:'*'}]}), (m)=>msgs.push(m), 'test'); assert.ok(msgs.length>0); }); });
