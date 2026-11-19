import { expect, test } from '@playwright/test';

test('shopping shows recipe names and scaled ingredient breakdowns', async ({ page }) => {
  const user = { id: 'test-owner', email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', is_anonymous: false };
  await page.addInitScript(({ user }) => {
    const session = { access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
    for (const project of ['placeholder', 'fnxgvmeaadyszvzxbqho']) localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session));
  }, { user });
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.includes('/auth/v1/user')) body = user;
    if (url.pathname.endsWith('/dinners')) body = { id:'dinner_test', owner_id:user.id, title:'Shopping sources test', cuisine:'Moroccan', event_date:'2026-11-21', guest_count:16 };
    if (url.pathname.endsWith('/shopping_items')) body = [{ id:'shop_test', item:'parsley', category:'Produce', purchased:false, quantity:1.125, unit:'cup', notes:'Buy fresh.', assignee:'', manual_covered_quantity:0, covered_quantity:0, unquantified_required:false, component_requirements:[], manual_covered_components:{}, covered_components:{}, raw_sources:[
      { recipeId:'one', recipeTitle:'Zaalouk', scaledQuantity:1, unit:'cup', rawText:'Chopped parsley' },
      { recipeId:'two', recipeTitle:'Carrot salad', scaledQuantity:2, unit:'tbsp', rawText:'Fresh parsley' },
    ] }];
    await route.fulfill({ json:body });
  });
  await page.goto('#/app/dinners/dinner_test?view=shopping');
  const row = page.locator('.shopping-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.shopping-name > small')).toHaveText('Zaalouk · Carrot salad');
  await row.getByText('Recipe quantities', { exact:true }).click();
  await expect(row.locator('li')).toHaveCount(2);
  await expect(row.locator('li').first()).toContainText('Zaalouk: 1 cup');
  await expect(row.locator('li').last()).toContainText('Carrot salad: 2 tbsp');
  await expect(page.getByRole('button',{name:'Share night', exact:true, includeHidden:true})).toBeAttached();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
});

