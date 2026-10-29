import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS_BY_NAME } from '../src/lib/mcp/tools.ts';

const anon = { header: () => null };

test('the review tools are listed and refuse a caller without a submissions:review token', async () => {
  for (const name of ['list_submissions', 'accept_submissions']) {
    const tool = TOOLS_BY_NAME.get(name);
    assert.ok(tool, `${name} is registered`);
    assert.match(tool.description, /submissions:review/);
    await assert.rejects(() => tool.run({}, anon), /submissions:review/);
  }
  assert.equal(TOOLS_BY_NAME.get('accept_submissions').annotations.readOnlyHint, false);
});
