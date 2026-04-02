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
