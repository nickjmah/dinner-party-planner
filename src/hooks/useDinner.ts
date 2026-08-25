import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDinnerDetail, rebuildShoppingForDinner, updateRow } from '../lib/api';

export function useDinner(dinnerId: string) {
  return useQuery({
    queryKey: ['dinner', dinnerId],
    queryFn: () => getDinnerDetail(dinnerId),
    enabled: Boolean(dinnerId),
    staleTime: 30_000,
  });
}

export function useUpdateDinnerRow(dinnerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id, patch }: { table: string; id: string; patch: Record<string, unknown> }) => {
      await updateRow(table, id, patch);
      if (table === 'recipes' && ('target_servings' in patch || 'yield_servings' in patch)) await rebuildShoppingForDinner(dinnerId);
      if (table === 'tasks' && 'ingredient_progress' in patch) await rebuildShoppingForDinner(dinnerId);
    },
    onMutate: async ({ table, id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['dinner', dinnerId] });
      const previous = queryClient.getQueryData(['dinner', dinnerId]);
      queryClient.setQueryData(['dinner', dinnerId], (detail: Record<string, unknown> | undefined) => {
        if (!detail) return detail;
        const keyByTable: Record<string, string> = { shopping_items: 'shopping', tasks: 'tasks', recipes: 'recipes', dinners: 'dinner' };
        const key = keyByTable[table];
        if (!key) return detail;
        if (key === 'dinner') return { ...detail, dinner: { ...(detail.dinner as object), ...patch } };
        return { ...detail, [key]: (detail[key] as Array<Record<string, unknown>>).map((row) => row.id === id ? { ...row, ...patch } : row) };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(['dinner', dinnerId], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['dinner', dinnerId] }),
  });
}
