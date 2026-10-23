// A page of the right name with no template is free text the app never reads (owner, 2026-10-22:
// "Drake lava powder" was such a page, and the owner made a second one).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasItemTemplate, hasMobTemplate } from '../src/shared/wikiTemplates'

test('AN ITEM OR MOB PAGE IS KNOWN BY ITS TEMPLATE, ANY CASE OR SPACING; FREE TEXT IS NEITHER', () => {
  assert.ok(hasItemTemplate('{{Classic Era}}\n<onlyinclude>{{Itempage\n|itemname = X'))
  assert.ok(hasItemTemplate('{{ itempage|itemname=X}}'))
  assert.ok(!hasItemTemplate("{{Classic Era}}\n\n[[File:Item 1076.png]]\n\nDrake Lava Powder\n\nNo Trade, Quest<br>"))
  assert.ok(hasMobTemplate('{{delete}}{{DNE}}{{Namedmobpage\n| name = a rotting citizen'))
  assert.ok(hasMobTemplate('{{MerchantPage|name=Bob}}'))
  assert.ok(!hasMobTemplate('A fire drake lives in Lavastorm.'))
  assert.ok(!hasItemTemplate('{{Itempages}}'), 'another template whose name starts the same')
})
