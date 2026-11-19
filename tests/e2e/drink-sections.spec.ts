import { expect, test } from '@playwright/test';

test('food and drinks have separate recipes and a shared shopping status', async ({ page }) => {
  const user={id:'test-owner',email:'owner@example.test',aud:'authenticated',role:'authenticated',is_anonymous:false};
  const recipes=[
    {id:'food',title:'Carrot salad',short_title:'',source_type:'manual',provenance:{},yield_servings:4,target_servings:4},
    {id:'tea',title:'Mint tea',short_title:'',source_type:'manual',provenance:{},yield_servings:4,target_servings:4},
    {id:'gin',title:'Gin cocktail',short_title:'',source_type:'manual',provenance:{},yield_servings:4,target_servings:4},
  ];
  const base={category:'Produce',purchased:false,quantity:1,unit:'cup',notes:'',assignee:'',manual_covered_quantity:0,covered_quantity:0,unquantified_required:false,component_requirements:[],manual_covered_components:{},covered_components:{}};
  const shopping=[
    {...base,id:'mint',item:'mint',raw_sources:[{recipeId:'food',recipeTitle:'Carrot salad',scaledQuantity:0.5,unit:'cup'},{recipeId:'tea',recipeTitle:'Mint tea',scaledQuantity:0.5,unit:'cup'}]},
    {...base,id:'carrot',item:'carrots',raw_sources:[{recipeId:'food',recipeTitle:'Carrot salad',scaledQuantity:1,unit:'cup'}]},
    {...base,id:'gin',item:'gin',raw_sources:[{recipeId:'gin',recipeTitle:'Gin cocktail',scaledQuantity:1,unit:'cup'}]},
  ];
  await page.addInitScript(({user})=>{const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};for(const project of ['placeholder','fnxgvmeaadyszvzxbqho'])localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify(session));},{user});
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url()); let body:unknown=[];
    if(url.pathname.includes('/auth/v1/user'))body=user;
    if(url.pathname.endsWith('/dinners'))body={id:'dinner_test',owner_id:user.id,title:'Drinks sections test',cuisine:'Moroccan',event_date:'2026-11-21',guest_count:4};
    if(url.pathname.endsWith('/recipes')) {
      if(route.request().method()==='PATCH') {const target=recipes.find(row=>`eq.${row.id}`===url.searchParams.get('id'));if(target)Object.assign(target,route.request().postDataJSON());}
      body=recipes;
    }
    if(url.pathname.endsWith('/shopping_items')){
      if(route.request().method()==='PATCH') {const target=shopping.find(row=>`eq.${row.id}`===url.searchParams.get('id'));if(target)Object.assign(target,route.request().postDataJSON());}
      body=shopping;
    }
    await route.fulfill({json:body});
  });
  await page.goto('#/app/dinners/dinner_test?view=recipes');
  await expect(page.getByRole('heading',{name:'Food recipes',exact:true})).toBeVisible();
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.getByRole('group',{name:'Recipe section'}).getByRole('button',{name:'Drinks (2)',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Drink recipes',exact:true})).toBeVisible();
  await expect(page.locator('.recipe-card')).toHaveCount(2);
  await expect(page.getByRole('heading',{name:'Mint tea',exact:true})).toBeVisible();
  await page.goto('#/app/dinners/dinner_test?view=shopping');
  await expect(page.locator('.shopping-row')).toHaveCount(3);
  const filter=page.getByRole('group',{name:'Ingredient section'});
  await filter.getByRole('button',{name:'Drink ingredients',exact:true}).click();
  await expect(page.locator('.shopping-row')).toHaveCount(2);
  await expect(page.locator('.shopping-name > strong').filter({hasText:'carrots'})).toHaveCount(0);
  const mint=page.locator('.shopping-row').filter({has:page.locator('.shopping-name > strong').filter({hasText:/^mint$/})});
  await expect(mint.getByText('Food + drinks · combined total')).toBeVisible();
  await mint.locator('label.check').click();
  await expect(mint.getByRole('checkbox')).toBeChecked();
  await filter.getByRole('button',{name:'Food ingredients',exact:true}).click();
  await expect(page.locator('.shopping-row')).toHaveCount(2);
  await expect(mint.getByRole('checkbox')).toBeChecked();
  await filter.getByRole('button',{name:'All ingredients',exact:true}).click();
  await expect(page.locator('.shopping-row')).toHaveCount(3);
  await page.goto('#/app/dinners/dinner_test?view=recipes');
  await page.getByRole('group',{name:'Recipe section'}).getByRole('button',{name:'Drinks (2)',exact:true}).click();
  const ginRecipe=page.locator('.recipe-card').filter({has:page.getByRole('heading',{name:'Gin cocktail',exact:true})});
  await ginRecipe.getByRole('button',{name:'Recipe actions',exact:true}).click();
  await ginRecipe.getByRole('button',{name:'Move to food',exact:true}).click();
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.goto('#/app/dinners/dinner_test?view=shopping');
  await filter.getByRole('button',{name:'Drink ingredients',exact:true}).click();
  await expect(page.locator('.shopping-row')).toHaveCount(1);
});

