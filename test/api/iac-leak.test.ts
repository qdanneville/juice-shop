/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Express } from 'express'
import { createTestApp } from './helpers/setup'

let app: Express
before(async () => { app = (await createTestApp()).app }, { timeout: 60000 })

void describe('Login Cloud Admin (IaC leak)', () => {
  void it('le fichier terraform servi ne contient plus la cle privee', async () => {
    const res = await request(app).get('/infrastructure/terraform/networking.tf')
    assert.equal(res.status, 200)
    assert.ok(!res.text.includes('BEGIN RSA PRIVATE KEY'))
    assert.ok(!/private_key\s*=\s*"-----BEGIN/.test(res.text))
  })
})
