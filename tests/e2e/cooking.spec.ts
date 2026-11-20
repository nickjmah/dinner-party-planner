import { expect, test } from '@playwright/test';
test('cooking runs chronologically through dessert and shows actionable notes',async({page})=>{
 const user={id:'test-owner',aud:'authenticated',role:'authenticated',is_anonymous:false};
 const tasks=[{id:'dessert',title:'Serve dessert',day_offset:0,start_time:'20:30:00',duration_minutes:15,sort_order:1,status:'todo',resource:'counter',notes:'Use clean dessert utensils.',source_step_ids:['step_dessert'],recipe_id:'r'}, {id:'lamb',title:'Cook lamb',day_offset:0,start_time:'16:00:00',duration_minutes:150,sort_order:99,status:'todo',resource:'burner',notes:'Simmer until tender.',source_step_ids:[]}, {id:'salads',title:'Serve salads',day_offset:0,start_time:'19:00:00',duration_minutes:5,sort_order:2,status:'todo',resource:'counter',notes:'Dress just before serving.',source_step_ids:[]}, {id:'friday',title:'Friday preparation',day_offset:-1,start_time:'10:00:00',duration_minutes:30,sort_order:0,status:'todo',resource:'counter',notes:'',source_step_ids:[]}];
 await page.addInitScript(({user})=>{const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};for(const project of ['placeholder','fnxgvmeaadyszvzxbqho'])localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify(session));},{user});
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let body:unknown=[];
  if(url.pathname.includes('/auth/v1/user'))body=user;
  if(url.pathname.endsWith('/dinners'))body={id:'dinner_test',owner_id:user.id,title:'Cooking test',cuisine:'Moroccan',event_date:'2026-11-21',serve_time:'19:00:00',guest_count:16};
  if(url.pathname.endsWith('/recipes'))body=[{id:'r',title:'Orange dessert',short_title:'',provenance:{}}];
  if(url.pathname.endsWith('/steps'))body=[{id:'step_dessert',recipe_id:'r',position:1,raw_text:'Arrange oranges on a clean platter.',translated_text:''}];
  if(url.pathname.endsWith('/tasks')){if(route.request().method()==='PATCH'){const target=tasks.find(t=>`eq.${t.id}`===url.searchParams.get('id'));if(target)Object.assign(target,route.request().postDataJSON());}body=tasks;}
  await route.fulfill({json:body});
 });
 await page.goto('#/app/dinners/dinner_test?view=cooking');
 await expect(page.getByText('3 of 3 tasks left')).toBeVisible();
 await expect(page.getByText('Schedule through 8:45 PM')).toBeVisible();
 await expect(page.locator('.cook-task h3')).toHaveText(['Cook lamb','Serve salads','Serve dessert']);
 const last=page.locator('.cook-task').last();
 await expect(last.getByText('Use clean dessert utensils.')).toBeVisible();
 await last.getByText('Recipe steps (1)').click();
 await expect(last.getByText('Arrange oranges on a clean platter.')).toBeVisible();
 await last.locator('label.check').click();
 await expect(page.getByText('2 of 3 tasks left')).toBeVisible();
 await expect(last.getByRole('checkbox')).toBeChecked();
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.locator('body').evaluate(el=>el.clientWidth));
});
