/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

void describe('Exposed Credentials', () => {
  void it('le composant de login ne contient aucun identifiant de test en dur', () => {
    const src = readFileSync('frontend/src/app/login/login.component.ts', 'utf8')
    assert.ok(!src.includes('IamUsedForTesting'), 'mot de passe de test present dans le code client')
    assert.ok(!/testing@[\w.-]+/.test(src), 'e-mail de test present dans le code client')
  })
})
