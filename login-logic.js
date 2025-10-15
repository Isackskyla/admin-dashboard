console.log('login-logic.js loaded successfully'); // Debug: Check console if this appears

let authSection, dashboard, loginError;
let deleteCategory, deleteImageId; // To hold delete params

window.onload = function() {
    authSection = document.getElementById('auth-section');
    dashboard = document.getElementById('dashboard');
    loginError = document.getElementById('login-error');

    checkAuth();
};

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient('https://pqffootznndbljthwayl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxZmZvb3R6bm5kYmxqdGh3YXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjkyMjUsImV4cCI6MjA3NDgwNTIyNX0.qThWzc6d62ZvM9S3YWs1XIiXFrapsePKHhfEeC1r8kw');

// Check auth state on load
async function checkAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user && user.user_metadata?.role === 'admin') {
        showDashboard();
    } else {
        showAuth();
    }
}

function showDashboard() {
    if (authSection) authSection.style.display = 'none';
    if (dashboard) dashboard.classList.add('active');
    loadGalleryList(); // Load default category list on dashboard show
}

function showAuth() {
    if (authSection) authSection.style.display = 'block';
    if (dashboard) dashboard.classList.remove('active');
    // Reset form and error
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    if (loginEmail) loginEmail.value = '';
    if (loginPassword) loginPassword.value = '';
    if (loginError) loginError.textContent = '';
}

// Login function
async function login() {
    console.log('Login attempted'); // Debug
    if (!loginError) return;
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    loginError.textContent = '';

    if (!email || !password) {
        loginError.textContent = 'Please fill in all fields.';
        return;
    }

    const loginBtn = document.getElementById('login-btn');
    const loginLoading = document.getElementById('login-loading');
    loginBtn.disabled = true;
    loginLoading.style.display = 'block';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            loginError.textContent = error.message || 'Login failed. Please try again.';
            return;
        }

        // Role check after login
        if (data.user.user_metadata?.role !== 'admin') {
            loginError.textContent = 'Admin access only.';
            await supabaseClient.auth.signOut();
            return;
        }

        showDashboard();
    } finally {
        loginBtn.disabled = false;
        loginLoading.style.display = 'none';
    }
}

// Logout function
async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Logout error:', error);
    } else {
        showAuth();
    }
}

// Listen for auth state changes
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event); // Debug
    if (event === 'SIGNED_IN') {
        const user = session?.user;
        if (user && user.user_metadata?.role === 'admin') {
            showDashboard();
        } else {
            showAuth();
        }
    } else if (event === 'SIGNED_OUT') {
        showAuth();
    }
});

// Add/Update Photo Function
async function addPhoto() {
    console.log('Add photo attempted'); // Debug
    const category = document.getElementById('category').value;
    const image_id = document.getElementById('image_id').value.trim();
    const file = document.getElementById('file').files[0];
    const successEl = document.getElementById('add-success');
    const errorEl = document.getElementById('add-error');
    successEl.textContent = '';
    errorEl.textContent = '';

    if (!image_id || !file) {
        errorEl.textContent = 'Please provide filename and file.';
        return;
    }

    const addBtn = document.getElementById('add-btn');
    const addLoading = document.getElementById('add-loading');
    addBtn.disabled = true;
    addLoading.style.display = 'block';

    try {
        // Upload to Storage (upsert overwrites if exists)
        const { error: uploadError } = await supabaseClient.storage
            .from(category)
            .upload(image_id, file, { upsert: true });

        if (uploadError) {
            errorEl.textContent = `Upload failed: ${uploadError.message}`;
            console.error('Upload error:', uploadError);
            return;
        }

        // Initialize or reset views to 0 (optional: or keep existing views on update)
        const { error: viewsError } = await supabaseClient
            .from('image_views')
            .upsert({ image_id: image_id, view_count: 0 }, { onConflict: 'image_id' });

        if (viewsError) {
            errorEl.textContent = `Views init failed: ${viewsError.message}`;
            console.error('Views error:', viewsError);
            return;
        }

        successEl.textContent = 'Photo added/updated successfully!';
        document.getElementById('image_id').value = '';
        document.getElementById('file').value = '';
        loadGalleryList(); // Refresh current list
    } finally {
        addBtn.disabled = false;
        addLoading.style.display = 'none';
    }
}

// Load Gallery List with Views and Delete
async function loadGalleryList() {
    console.log('Loading gallery list'); // Debug
    const category = document.getElementById('list-category').value;
    const listLoading = document.getElementById('list-loading');
    const galleryList = document.getElementById('gallery-list');
    listLoading.style.display = 'block';
    galleryList.innerHTML = '';

    try {
        const { data: files, error: listError } = await supabaseClient.storage
            .from(category)
            .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        if (listError) {
            galleryList.innerHTML = `<p class="error-message">Error loading: ${listError.message}</p>`;
            console.error('List error:', listError);
            return;
        }

        if (!files || files.length === 0) {
            galleryList.innerHTML = '<p>No photos in this category.</p>';
            return;
        }

        // Fetch views for these files
        const image_ids = files.map(file => file.name);
        const { data: viewsData, error: viewsError } = await supabaseClient
            .from('image_views')
            .select('image_id, view_count')
            .in('image_id', image_ids);

        if (viewsError) console.error('Views fetch error:', viewsError);

        const viewsMap = {};
        if (viewsData) {
            viewsData.forEach(v => viewsMap[v.image_id] = v.view_count);
        }

        const listHtml = files.map(file => {
            const publicUrl = supabaseClient.storage.from(category).getPublicUrl(file.name).data.publicUrl;
            const views = viewsMap[file.name] || 0;
            return `
                <div class="gallery-item">
                    <img src="${publicUrl}" alt="${file.name}">
                    <div class="gallery-info">
                        <p><strong>${file.name}</strong></p>
                        <p>Views: ${views}</p>
                        <button class="btn btn-danger" onclick="openDeleteModal('${category}', '${file.name}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        galleryList.innerHTML = listHtml;
    } finally {
        listLoading.style.display = 'none';
    }
}

// Delete Modal Functions
function openDeleteModal(category, image_id) {
    deleteCategory = category;
    deleteImageId = image_id;
    document.getElementById('delete-category').textContent = category;
    document.getElementById('delete-filename').textContent = image_id;
    document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
}

// Confirm Delete
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    console.log('Delete confirmed:', deleteCategory, deleteImageId);
    closeDeleteModal();

    const { error: storageError } = await supabaseClient.storage.from(deleteCategory).remove([deleteImageId]);
    if (storageError) {
        alert(`Delete failed: ${storageError.message}`);
        console.error('Storage delete error:', storageError);
        return;
    }

    const { error: viewsError } = await supabaseClient.from('image_views').delete().eq('image_id', deleteImageId);
    if (viewsError) {
        console.error('Views delete error:', viewsError);
    }

    alert('Photo deleted successfully!');
    loadGalleryList();
});