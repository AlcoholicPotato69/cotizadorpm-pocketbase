import os

fp = 'frontend/client/system/config.html'
with open(fp, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Navbar
navbar_search = '''        <button type="button" id="menu-materials" onclick="switchView('v_materials'); return false;" class="tool-tab hidden">
          <i class="fa-solid fa-palette"></i> Config de espacio
        </button>'''
navbar_replace = navbar_search + '''
        <button type="button" id="menu-users" onclick="switchView('v_users'); return false;" class="tool-tab">
          <i class="fa-solid fa-users"></i> Usuarios
        </button>'''
if navbar_search in text: text = text.replace(navbar_search, navbar_replace)
else: print('Navbar failed')

# 2. View and Modal HTML
main_end_search = '  </main>'

v_users_html = '''
    <!-- VISTA DE USUARIOS -->
    <div id="v_users" class="view hidden">
      <div class="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 class="text-lg sm:text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center text-sm">
              <i class="fa-solid fa-users"></i>
            </div>
            Gestión de Usuarios Administrativos
          </h2>
          <p class="text-[11px] sm:text-xs text-gray-500 font-bold mt-1">
            Revisión y edición de todos los usuarios registrados en el panel
          </p>
        </div>
        <button type="button" onclick="window.openUserModal()" class="shrink-0 bg-brand-red text-white hover:bg-red-700 transition px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:shadow-md flex items-center gap-2">
          <i class="fa-solid fa-user-plus"></i> Añadir Usuario
        </button>
      </div>
      <div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr class="bg-gray-50/80 border-b border-gray-100">
                <th class="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Usuario</th>
                <th class="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Rol</th>
                <th class="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Sede Principal</th>
                <th class="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Permisos de Acceso</th>
                <th class="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody id="users-tbody" class="divide-y divide-gray-100/60 text-xs text-gray-700">
              <tr><td colspan="5" class="py-8 text-center text-gray-400 font-bold italic">Cargando usuarios...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
'''

modal_html = '''
  <!-- Modal Usuarios -->
  <div id="modal-user" class="fixed inset-0 bg-black/60 z-[100] hidden items-center justify-center p-4 backdrop-blur-sm transition-opacity opacity-0">
    <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col scale-95 transition-transform duration-300" id="modal-user-content">
      <div class="bg-gray-50/80 px-6 py-4 flex justify-between items-center border-b border-gray-100">
        <h3 class="font-black text-gray-800 tracking-tight flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center text-[10px]">
            <i class="fa-solid fa-user"></i>
          </div>
          <span id="modal-user-title-text">Añadir Usuario</span>
        </h3>
        <button type="button" onclick="window.closeUserModal()" class="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-brand-red hover:border-brand-red flex items-center justify-center transition focus:outline-none">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <div class="p-6 overflow-y-auto max-h-[70vh] custom-scroll">
        <form id="form-user" class="space-y-4" onsubmit="window.saveUser(event)">
          <input type="hidden" id="user-id" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase text-brand-red tracking-wider">Correo Electrónico <span class="text-red-500">*</span></label>
              <input type="email" id="user-email" required placeholder="correo@ejemplo.com" class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition" />
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase text-brand-red tracking-wider">Alias / Nombre</label>
              <input type="text" id="user-name" placeholder="Nombre completo o alias" class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition" />
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase tracking-wider text-gray-500" id="lbl-password">Contraseña <span id="pwd-req" class="text-red-500">*</span></label>
              <input type="password" id="user-password" placeholder="Mínimo 8 caracteres" class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition" />
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase tracking-wider text-gray-500" id="lbl-passwordConfirm">Confirmar Clave <span id="pwdc-req" class="text-red-500">*</span></label>
              <input type="password" id="user-passwordConfirm" placeholder="Mínimo 8 caracteres" class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition" />
            </div>
          </div>
          <p class="text-[10px] text-gray-400 font-bold hidden" id="user-pwd-hint">Para cambiar la contraseña, llena los campos arriba. Déjalos en blanco para conservarla.</p>
          <hr class="border-gray-100 my-2">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase text-brand-red tracking-wider">Rol de Sistema <span class="text-red-500">*</span></label>
              <select id="user-role" required class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition text-gray-700 cursor-pointer">
                <option value="admin">Administrador Global</option>
                <option value="plaza_mayor">Agente Plaza Mayor</option>
                <option value="casa_de_piedra">Agente Casa Piedra</option>
                <option value="user">Usuario Básico</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] font-black uppercase text-brand-red tracking-wider">Sede Principal <span class="text-red-500">*</span></label>
              <select id="user-default-tenant" required class="w-full text-sm font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-red focus:bg-white transition text-gray-700 cursor-pointer">
                <option value="plaza_mayor">Plaza Mayor</option>
                <option value="casa_de_piedra">Casa de Piedra</option>
              </select>
            </div>
          </div>
          <div class="space-y-2 mt-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
             <label class="block text-[10px] font-black uppercase text-gray-500 tracking-wider">Sedes Permitidas (Accesos Multi-Tenant)</label>
             <div class="flex flex-col sm:flex-row gap-4 mt-1">
                 <label class="flex items-center gap-2 cursor-pointer w-max">
                     <input type="checkbox" id="user-allowed-pm" value="plaza_mayor" class="accent-brand-red w-4 h-4 rounded cursor-pointer" />
                     <span class="text-xs font-bold text-gray-700">Plaza Mayor</span>
                 </label>
                 <label class="flex items-center gap-2 cursor-pointer w-max">
                     <input type="checkbox" id="user-allowed-cp" value="casa_de_piedra" class="accent-brand-red w-4 h-4 rounded cursor-pointer" />
                     <span class="text-xs font-bold text-gray-700">Casa de Piedra</span>
                 </label>
             </div>
          </div>
        </form>
      </div>
      <div class="bg-gray-50 border-t border-gray-100 p-4 flex justify-end gap-3 rounded-b-3xl shrink-0">
        <button type="button" onclick="window.closeUserModal()" class="px-5 py-2 rounded-xl text-xs font-black text-gray-500 hover:bg-gray-200 transition tracking-wider uppercase">Cancelar</button>
        <button type="submit" form="form-user" id="btn-save-user" class="bg-brand-red text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-red-700 transition tracking-wider uppercase shadow flex items-center gap-2">
          <i class="fa-solid fa-save"></i> Guardar
        </button>
      </div>
    </div>
  </div>
'''

if main_end_search in text: text = text.replace(main_end_search, v_users_html + '\n  </main>\n' + modal_html)
else: print('Main failed')

# 3. JS view switch logic
switch_search = "if(viewId === 'v_docs') await loadDocsConfig();"
switch_replace = switch_search + "\n      if(viewId === 'v_users') await loadUsers();"
if switch_search in text: text = text.replace(switch_search, switch_replace)
else: print('Switch failed')

# 4. JS functions right before 'await switchView('v_concepts');'
js_funcs = '''
      // --- LOGICA DE USUARIOS ---
      let allUsers = [];
      window.loadUsers = async function() {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-400 font-bold italic"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Cargando...</td></tr>';
        try {
          const pb = getDB();
          const records = await pb.collection('app_users').getFullList({ sort: '-created' });
          allUsers = records;
          
          if (records.length === 0) {
             tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-400 font-bold italic">No hay usuarios registrados.</td></tr>';
             return;
          }

          let html = '';
          const roleLabels = { 'admin': 'Admin', 'plaza_mayor': 'Agente PM', 'casa_de_piedra': 'Agente CP', 'user': 'Usuario' };
          const roleColors = { 'admin': 'bg-red-100 text-red-700', 'plaza_mayor': 'bg-blue-100 text-blue-700', 'casa_de_piedra': 'bg-amber-100 text-amber-700', 'user': 'bg-gray-100 text-gray-600' };

          records.forEach(u => {
             const rLabel = roleLabels[u.role] || u.role;
             const rColor = roleColors[u.role] || roleColors['user'];
             
             let tenDefault = 'N/A';
             if (u.tenant_default === 'plaza_mayor') tenDefault = 'Plaza Mayor';
             if (u.tenant_default === 'casa_de_piedra') tenDefault = 'Casa de Piedra';

             let allowed = (u.allowed_tenants || []).map(t => {
               if(t==='plaza_mayor') return '<span class="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold">PM</span>';
               if(t==='casa_de_piedra') return '<span class="inline-block px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-bold">CP</span>';
               return t;
             }).join(' ');

             html += `
                <tr class="hover:bg-gray-50/50 transition">
                  <td class="py-3 px-4">
                    <div class="font-black text-gray-800">${u.login_username || 'Sin Nombre'}</div>
                    <div class="text-[10px] text-gray-400 font-bold">${u.email}</div>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${rColor}">${rLabel}</span>
                  </td>
                  <td class="py-3 px-4 font-bold text-gray-600">${tenDefault}</td>
                  <td class="py-3 px-4 flex gap-1 flex-wrap">${allowed || '<span class="text-gray-400 italic">Ninguno</span>'}</td>
                  <td class="py-3 px-4 text-center">
                    <button type="button" onclick="window.editUser('${u.id}')" class="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-brand-red hover:text-white transition focus:outline-none">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                    ${u.id !== pb.authStore.model.id ? `
                    <button type="button" onclick="window.deleteUser('${u.id}')" class="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-600 hover:text-white mt-1 transition focus:outline-none">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                    ` : ''}
                  </td>
                </tr>
             `;
          });
          tbody.innerHTML = html;
        } catch(e) {
          console.error("Error al cargar usuarios:", e);
          tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500 font-bold">Error al cargar listado: ${e.message}</td></tr>`;
        }
      };

      window.openUserModal = function() {
        document.getElementById('user-id').value = '';
        document.getElementById('form-user').reset();
        document.getElementById('modal-user-title-text').innerText = 'Añadir Usuario Nuevo';
        document.getElementById('user-pwd-hint').classList.add('hidden');
        document.getElementById('pwd-req').classList.remove('hidden');
        document.getElementById('pwdc-req').classList.remove('hidden');
        
        document.getElementById('user-password').required = true;
        document.getElementById('user-passwordConfirm').required = true;

        const modal = document.getElementById('modal-user');
        const mcontent = document.getElementById('modal-user-content');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
          modal.classList.remove('opacity-0');
          mcontent.classList.remove('scale-95');
        }, 10);
      };

      window.closeUserModal = function() {
        const modal = document.getElementById('modal-user');
        const mcontent = document.getElementById('modal-user-content');
        modal.classList.add('opacity-0');
        mcontent.classList.add('scale-95');
        setTimeout(() => {
          modal.classList.remove('flex');
          modal.classList.add('hidden');
        }, 300);
      };

      window.editUser = function(id) {
        const user = allUsers.find(u => u.id === id);
        if(!user) return;
        
        window.openUserModal();

        document.getElementById('user-id').value = user.id;
        document.getElementById('user-email').value = user.email || '';
        document.getElementById('user-name').value = user.login_username || user.username || '';
        document.getElementById('user-role').value = user.role || 'user';
        document.getElementById('user-default-tenant').value = user.tenant_default || 'plaza_mayor';
        
        document.getElementById('user-allowed-pm').checked = (user.allowed_tenants || []).includes('plaza_mayor');
        document.getElementById('user-allowed-cp').checked = (user.allowed_tenants || []).includes('casa_de_piedra');

        document.getElementById('modal-user-title-text').innerText = 'Editar Usuario';
        document.getElementById('user-pwd-hint').classList.remove('hidden');
        document.getElementById('pwd-req').classList.add('hidden');
        document.getElementById('pwdc-req').classList.add('hidden');
        document.getElementById('user-password').required = false;
        document.getElementById('user-passwordConfirm').required = false;
      };

      window.deleteUser = async function(id) {
        if(!confirm('¿Estás seguro de que deseas eliminar este usuario definitivamente?')) return;
        try {
           await getDB().collection('app_users').delete(id);
           _toast('Usuario eliminado con éxito', 'success');
           await loadUsers();
        } catch(e) {
           _toast('Error al eliminar usuario: ' + e.message, 'error');
        }
      };

      window.saveUser = async function(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-user');
        
        const id = document.getElementById('user-id').value;
        const email = document.getElementById('user-email').value;
        const name = document.getElementById('user-name').value;
        const pass = document.getElementById('user-password').value;
        const passC = document.getElementById('user-passwordConfirm').value;
        const role = document.getElementById('user-role').value;
        const defaultTenant = document.getElementById('user-default-tenant').value;
        
        let allowed = [];
        if(document.getElementById('user-allowed-pm').checked) allowed.push('plaza_mayor');
        if(document.getElementById('user-allowed-cp').checked) allowed.push('casa_de_piedra');
        if(allowed.length === 0) allowed.push(defaultTenant); // fallback safe
        
        if (pass || passC || !id) {
           if(pass !== passC) {
              return _toast('Las contraseñas no coinciden', 'error');
           }
           if(pass.length < 8) {
              return _toast('La contraseña debe tener al menos 8 caracteres', 'error');
           }
        }

        const data = {
          email: email,
          login_username: name,
          role: role,
          tenant_default: defaultTenant,
          allowed_tenants: allowed
        };
        
        if (pass) {
          data.password = pass;
          data.passwordConfirm = passC;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';

        try {
          const pb = getDB();
          if (id) {
            await pb.collection('app_users').update(id, data);
            _toast('Usuario actualizado', 'success');
          } else {
            await pb.collection('app_users').create(data);
            _toast('Usuario creado exitosamente', 'success');
          }
          window.closeUserModal();
          await loadUsers();
        } catch (err) {
          console.error("Save User Error:", err);
          let msg = err.message;
          if (err.data && err.data.data) {
             const keys = Object.keys(err.data.data);
             if(keys.length > 0) msg += ': ' + keys.map(k => `${k} -> ${err.data.data[k].message}`).join(', ');
          }
          _toast("Error: " + msg, "error");
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      };
'''

func_insert_search = "      // default view\n      await switchView('v_concepts');"
if func_insert_search in text: text = text.replace(func_insert_search, js_funcs + "\n" + func_insert_search)
else: print('Func failed')

with open(fp, 'w', encoding='utf-8') as f:
    f.write(text)
print('Patch applied')
