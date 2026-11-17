import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { API_LOG_ENV, BASE_URL_ENV } from './env.js'

const apiLog = () => readFile(process.env[API_LOG_ENV]!, 'utf8')

// Keeps the API's whole log beside the trace when the test fails.
test.afterEach(async () => {
  const testInfo = test.info()
  if (testInfo.status !== testInfo.expectedStatus) {
    await writeFile(testInfo.outputPath('api.log'), await apiLog())
  }
})

test('sign up, link one Note from another, and follow the Backlink', async ({ page }) => {
  const baseUrl = process.env[BASE_URL_ENV]!
  // The database is fresh each run, but a unique address keeps a rerun against
  // a kept one working too.
  const email = `e2e+${Date.now()}@example.com`
  const password = 'correct horse battery'

  await test.step('sign up', async () => {
    await page.goto(`${baseUrl}/signup`)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Display name').fill(`e2e${Date.now()}`)
    await page.getByRole('textbox', { name: 'Password' }).fill(password)
    await page.getByRole('button', { name: 'Sign up' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  })

  await test.step('verify the email', async () => {
    await page.goto(await verificationLink(email))
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible()
  })

  await test.step('log in', async () => {
    await page.goto(`${baseUrl}/login`)
    await page.getByLabel('Email').fill(email)
    await page.getByRole('textbox', { name: 'Password' }).fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/notes$/)
  })

  const target = 'Isolated pawns'
  const source = 'Italian game'
  await test.step('create two Notes', async () => {
    await newNote(page, target)
    await newNote(page, source)
  })
  const sourceUrl = page.url()

  const moveId = await test.step('comment on a Move with a Link to the other Note', async () => {
    // 1.e4, played on the board and saved as the Note's first Move
    await page.locator('[data-square="e2"]').click()
    await page.locator('[data-square="e4"]').click()
    const e4 = page.getByRole('button', { name: 'e4', exact: true })
    await expect(e4).toHaveAttribute('aria-current', 'step')

    await e4.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Add comment' }).click()
    const comment = page.getByRole('textbox', { name: 'Comment on 1.e4' })
    await comment.pressSequentially('Compare [[')
    await page.getByRole('combobox', { name: 'Find a note to link' }).fill('isolated')
    await page.getByRole('option', { name: new RegExp(`^${target}`) }).click()
    await expect(comment).toHaveValue(/^Compare \[\[note:\d+\]\]$/)

    const saved = page.waitForResponse((res) => res.request().method() === 'PUT' && res.url().endsWith('/writing'))
    await comment.press('Enter')
    const response = await saved
    expect(response.ok()).toBe(true)
    const row = (await response.json()) as { id: number }
    // The Link shows the target's name, in the move list's writing
    await expect(writtenLink(page, target)).toBeVisible()
    return row.id
  })

  await test.step('the other Note shows the Backlink', async () => {
    await writtenLink(page, target).click()
    await expect(page.getByRole('heading', { name: target })).toBeVisible()
    const linkedFrom = page.getByRole('region', { name: 'Linked from' })
    await expect(linkedFrom.getByText('Comment on 1.e4')).toBeVisible()
    await linkedFrom.getByRole('link', { name: source }).click()
  })

  await test.step('following it opens the first Note at that Move', async () => {
    await expect(page).toHaveURL(`${sourceUrl}?move=${moveId}`)
    await expect(page.getByRole('heading', { name: source })).toBeVisible()
    await expect(page.getByRole('button', { name: 'e4', exact: true })).toHaveAttribute('aria-current', 'step')
  })
})

/** Finds the verification email sent to this address in the API's log, and its link. */
async function verificationLink(email: string): Promise<string> {
  let link: string | undefined
  await expect
    .poll(async () => {
      const block = (await apiLog()).split('---------- email (console mailer) ----------').find((b) => b.includes(`To: ${email}\n`))
      link = block?.match(/https?:\/\/\S+\/verify-email\?token=\S+/)?.[0]
      return link
    }, { message: `a verification email to ${email} in the API's log` })
    .toBeDefined()
  return link!
}

/** A Link in the open Note's writing, not the same Note in the sidebar or Connections. */
function writtenLink(page: Page, name: string) {
  return page.getByRole('region', { name: 'Writing', exact: true }).getByRole('link', { name })
}

/** Makes a blank Note from the header and names it, leaving it open. */
async function newNote(page: Page, name: string) {
  await page.getByRole('button', { name: 'New note' }).first().click()
  const title = page.getByRole('textbox', { name: 'Rename note Untitled' })
  await expect(title).toBeFocused()
  await title.fill(name)
  await title.press('Enter')
  await expect(page.getByRole('heading', { name })).toBeVisible()
}
