import { describe, expect, it } from 'vitest';
import { canonicalIngredient } from '../supabase/functions/_shared/domain/quantity';
describe('shopping aliases', () => {
 it('consolidates herb preparation and cinnamon descriptions', () => { expect(canonicalIngredient('Fresh parsley')).toBe('parsley'); expect(canonicalIngredient('flat-leaf parsley')).toBe('parsley'); expect(canonicalIngredient('pinch ground cinnamon')).toBe('cinnamon'); expect(canonicalIngredient('sweet oranges')).toBe('oranges'); });
 it('keeps meaningful ingredient forms separate', () => { expect(canonicalIngredient('ground almonds')).not.toBe(canonicalIngredient('almonds')); expect(canonicalIngredient('ground ginger')).not.toBe(canonicalIngredient('fresh ginger')); expect(canonicalIngredient('cinnamon sticks')).not.toBe(canonicalIngredient('cinnamon')); expect(canonicalIngredient('mixed parsley and cilantro')).not.toBe(canonicalIngredient('parsley')); });
});
