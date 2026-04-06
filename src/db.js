import { supabase } from './supabaseClient';

// ============================================
// TRANSACTIONS
// ============================================

export const getAllTransactions = async () => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .neq('is_deleted', true)
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
    return data || [];
};

export const getAllTransactionsIncludingDeleted = async () => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
    return data || [];
};

export const addTransaction = async (transaction) => {
    const { data, error } = await supabase
        .from('transactions')
        .insert([transaction])
        .select();

    if (error) {
        console.error('Error adding transaction:', error);
        throw error;
    }
    return data[0];
};

export const addTransactions = async (transactions) => {
    const { data, error } = await supabase
        .from('transactions')
        .insert(transactions)
        .select();

    if (error) {
        console.error('Error adding transactions:', error);
        throw error;
    }
    return data;
};

export const updateTransaction = async (id, updates) => {
    const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating transaction:', error);
        throw error;
    }
    return data[0];
};

export const deleteTransaction = async (id) => {
    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting transaction:', error);
        throw error;
    }
};

export const deleteTransactions = async (ids) => {
    const { error } = await supabase
        .from('transactions')
        .update({ is_deleted: true })
        .in('id', ids);

    if (error) {
        console.error('Error deleting transactions:', error);
        throw error;
    }
};

export const clearAllTransactions = async () => {
    const { error } = await supabase
        .from('transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
        console.error('Error clearing transactions:', error);
        throw error;
    }
};

// ============================================
// CATEGORIES
// ============================================

export const getAllCategories = async () => {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching categories:', error);
        return [];
    }
    return data || [];
};

export const addCategory = async (category) => {
    const { data, error } = await supabase
        .from('categories')
        .insert([category])
        .select();

    if (error) {
        console.error('Error adding category:', error);
        throw error;
    }
    return data[0];
};

export const deleteCategory = async (id) => {
    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting category:', error);
        throw error;
    }
};

// ============================================
// CAMPS
// ============================================

export const getAllCamps = async () => {
    const { data, error } = await supabase
        .from('camps')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching camps:', error);
        return [];
    }
    return data || [];
};

export const addCamp = async (camp) => {
    const { data, error } = await supabase
        .from('camps')
        .insert([camp])
        .select();

    if (error) {
        console.error('Error adding camp:', error);
        throw error;
    }
    return data[0];
};

export const getCampByName = async (name) => {
    const { data, error } = await supabase
        .from('camps')
        .select('*')
        .ilike('name', name)
        .limit(1);

    if (error) {
        console.error('Error fetching camp:', error);
        return null;
    }
    return data?.[0] || null;
};

export const updateCamp = async (id, updates) => {
    const { data, error } = await supabase
        .from('camps')
        .update(updates)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating camp:', error);
        throw error;
    }
    return data?.[0] || null;
};

export const renameCampInTransactions = async (oldName, newName) => {
    const { error } = await supabase
        .from('transactions')
        .update({ camp: newName })
        .eq('camp', oldName);

    if (error) {
        console.error('Error renaming camp in transactions:', error);
        throw error;
    }
};

export const deleteCamp = async (id) => {
    const { error } = await supabase
        .from('camps')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting camp:', error);
        throw error;
    }
};

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export const subscribeToTransactions = (callback) => {
    const channel = supabase
        .channel('transactions-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'transactions' },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return channel;
};

export const subscribeToCategories = (callback) => {
    const channel = supabase
        .channel('categories-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'categories' },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return channel;
};

export const subscribeToCamps = (callback) => {
    const channel = supabase
        .channel('camps-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'camps' },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return channel;
};

export const unsubscribe = (channel) => {
    if (channel) {
        supabase.removeChannel(channel);
    }
};

// ============================================
// ACTIVITY LOG
// ============================================

// Strip volatile fields so we store a stable snapshot
const sanitizeSnapshot = (t) => {
    if (!t) return null;
    const { created_at, updated_at, ...rest } = t;
    return rest;
};

export const logActivity = async ({
    action,
    transactionId = null,
    snapshot = null,
    changes = null,
    message = '',
    details = null,
}) => {
    try {
        const { error } = await supabase
            .from('activity_log')
            .insert([{
                action,
                transaction_id: transactionId,
                transaction_snapshot: snapshot ? sanitizeSnapshot(snapshot) : null,
                changes,
                message,
                details,
            }]);
        if (error) {
            console.error('Error logging activity:', error);
        }
    } catch (e) {
        // Never let logging failures break the user action
        console.error('logActivity exception:', e);
    }
};

export const getActivityLog = async ({ limit = 200, offset = 0, action = null, dateFrom = null, dateTo = null, search = null } = {}) => {
    let q = supabase
        .from('activity_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (action) q = q.eq('action', action);
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00Z`);
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59Z`);
    if (search) q = q.or(`message.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) {
        console.error('Error fetching activity log:', error);
        return { rows: [], count: 0 };
    }
    return { rows: data || [], count: count || 0 };
};

export const clearActivityLog = async () => {
    const { error } = await supabase
        .from('activity_log')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
        console.error('Error clearing activity log:', error);
        throw error;
    }
};
