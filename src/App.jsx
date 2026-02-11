import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import inventoryData from './data/inventory.json';
import {
  Building2,
  Search,
  Plus,
  Minus,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Box,
  Download,
  Camera,
  Layers,
  MapPin,
  PieChart,
  Settings,
  RefreshCw,
  CloudCheck,
  CloudOff,
  Maximize2,
  X
} from 'lucide-react';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(val || 0);
};

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState('summary');
  const [selectedFloor, setSelectedFloor] = useState('All');
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFloors, setExpandedFloors] = useState(['PB', '1', '2', 'IT']);
  const [selectedImage, setSelectedImage] = useState(null); // For lightbox

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('floor', { ascending: true });

    if (!error) {
      setItems(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const seedDatabase = async () => {
    setSyncing(true);
    const flatItems = inventoryData.flatMap(space =>
      space.items.map(item => ({
        floor: space.floor,
        space: space.space,
        item_name: item.name,
        detail: item.detail,
        price: item.price,
        quantity: item.quantity
      }))
    );
    const { error } = await supabase.from('inventory').insert(flatItems);
    if (!error) fetchData();
    setSyncing(false);
  };

  const handleUpdateQuantity = async (id, delta, currentQty) => {
    const nextQty = Math.max(0, currentQty + delta);
    await supabase.from('inventory').update({ quantity: nextQty }).eq('id', id);
  };

  const handleUpdatePrice = async (id, newPrice) => {
    const priceVal = parseFloat(newPrice) || 0;
    await supabase.from('inventory').update({ price: priceVal }).eq('id', id);
  };

  const handleUpdateImage = async (floor, space, file) => {
    setSyncing(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${floor}-${space}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('space-images')
      .upload(filePath, file);

    if (uploadError) {
      alert("Error al subir imagen: " + uploadError.message);
      setSyncing(false);
      return;
    }

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('space-images')
      .getPublicUrl(filePath);

    // 3. Update all items in that space to have the same image
    const { error: updateError } = await supabase
      .from('inventory')
      .update({ image_url: publicUrl })
      .eq('floor', floor)
      .eq('space', space);

    if (updateError) alert("Error al guardar URL: " + updateError.message);
    setSyncing(false);
    fetchData();
  };

  const inventory = useMemo(() => {
    const grouped = items.reduce((acc, item) => {
      const key = `${item.floor}-${item.space}`;
      if (!acc[key]) {
        acc[key] = { floor: item.floor, space: item.space, image_url: item.image_url, items: [] };
      }
      acc[key].items.push(item);
      return acc;
    }, {});
    return Object.values(grouped);
  }, [items]);

  const filteredInventory = useMemo(() => {
    let result = inventory;
    if (selectedFloor !== 'All') result = result.filter(s => s.floor === selectedFloor);
    if (selectedSpaceId) result = result.filter(s => `${s.floor}-${s.space}` === selectedSpaceId);
    if (searchTerm) {
      result = result.filter(space =>
        space.space.toLowerCase().includes(searchTerm.toLowerCase()) ||
        space.items.some(item => item.item_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    return result;
  }, [inventory, selectedFloor, selectedSpaceId, searchTerm]);

  const grandTotal = useMemo(() => items.reduce((acc, item) => acc + (item.price * item.quantity), 0), [items]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <RefreshCw className="animate-spin text-white" size={48} />
    </div>
  );

  return (
    <div className="flex bg-[#f8fafc] min-h-screen">
      {/* LIGHTBOX */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-8 animate-in fade-in zoom-in duration-200" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors"><X size={40} /></button>
          <img src={selectedImage} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain border-4 border-white/10" alt="Enlarged view" />
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Building2 size={22} /></div>
            <div>
              <h1 className="text-lg font-black tracking-tighter text-slate-900 leading-tight">BB 519</h1>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DASHBOARD CLOUD</span>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          <button onClick={() => setView('summary')} className={`nav-item mb-2 ${view === 'summary' ? 'active' : ''}`}><PieChart size={18} />Resumen General</button>
          <button onClick={() => setView('operational')} className={`nav-item mb-6 ${view === 'operational' ? 'active' : ''}`}><LayoutGrid size={18} />Vista Operativa</button>

          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estructura</p>
          {['PB', '1', '2', 'IT'].map(floor => (
            <div key={floor} className="nav-group">
              <button
                onClick={() => { toggleFloor(floor); setSelectedFloor(floor); setView('operational'); }}
                className={`nav-item justify-between ${selectedFloor === floor ? 'active' : ''}`}
              >
                <div className="flex items-center gap-3"><Layers size={18} /><span>PISO {floor}</span></div>
                {expandedFloors.includes(floor) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expandedFloors.includes(floor) && (
                <div className="mt-1">
                  {inventory.filter(s => s.floor === floor).map(space => (
                    <button key={`${space.floor}-${space.space}`} onClick={() => { setSelectedSpaceId(`${space.floor}-${space.space}`); setView('operational'); }} className={`nav-sub-item ${selectedSpaceId === `${space.floor}-${space.space}` ? 'active' : ''}`}>{space.space}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          {items.length === 0 ? (
            <button onClick={seedDatabase} className="w-full bg-blue-600 text-white p-3 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2"><RefreshCw size={14} />Inicializar Datos</button>
          ) : (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center gap-2 text-emerald-600"><CloudCheck size={18} /><span className="text-[10px] font-black uppercase">Sincronización Activa</span></div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-layout flex-1">
        {view === 'summary' ? (
          <div className="animate-in fade-in duration-500">
            <div className="grand-total-section">
              <span className="label">Inversión Edificio Bahía Blanca 519</span>
              <span className="value">{formatCurrency(grandTotal)}</span>
            </div>
            <div className="summary-grid mt-12">
              {inventory.map(space => (
                <div key={`${space.floor}-${space.space}`} className="summary-card flex gap-6 items-center hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => { setSelectedSpaceId(`${space.floor}-${space.space}`); setView('operational'); }}>
                  <img src={space.image_url || '/office_building_facade.png'} className="w-24 h-24 rounded-2xl object-cover shadow-lg" alt="" />
                  <div>
                    <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest">PISO {space.floor}</h4>
                    <p className="text-xl font-black text-slate-800">{space.space}</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(space.items.reduce((a, i) => a + (i.price * i.quantity), 0))}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
            {filteredInventory.map(space => (
              <DashboardSpaceRow
                key={`${space.floor}-${space.space}`}
                space={space}
                onUpdateQuantity={handleUpdateQuantity}
                onUpdatePrice={handleUpdatePrice}
                onImageUpload={handleUpdateImage}
                onEnlarge={(url) => setSelectedImage(url)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DashboardSpaceRow({ space, onUpdateQuantity, onUpdatePrice, onImageUpload, onEnlarge }) {
  const total = space.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const currentImg = space.image_url || (space.floor === 'PB' ? '/Planta baja general.png' : space.floor === '1' ? '/Planta piso 1.png' : '/Planta piso 2.png');

  return (
    <div className="dash-card border-l-8 border-l-blue-500">
      <div className="dash-header items-center">
        <div className="flex gap-8 items-center">
          <div className="group relative thumbnail-container w-48 h-32 flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl transition-all" onClick={() => onEnlarge(currentImg)}>
            <img src={currentImg} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 size={24} className="text-white" />
            </div>
            <label className="absolute bottom-2 right-2 bg-white p-2 rounded-lg shadow-lg cursor-pointer hover:bg-slate-50 transition-colors" onClick={(e) => e.stopPropagation()}>
              <Camera size={16} className="text-blue-600" />
              <input type="file" className="hidden" accept="image/*" onChange={(e) => onImageUpload(space.floor, space.space, e.target.files[0])} />
            </label>
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">PISO {space.floor}</p>
            <h2 className="text-4xl font-black text-slate-900 leading-none">{space.space}</h2>
            <p className="text-xs font-bold text-slate-400 mt-3 flex items-center gap-2 uppercase tracking-tighter"><MapPin size={14} /> Bahía Blanca 519 | {space.items.length} Activos Cloud</p>
          </div>
        </div>
        <div className="total-pill bg-slate-900 p-6 rounded-3xl text-right shadow-2xl scale-110">
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">TOTAL ÁREA</span>
          <span className="text-3xl font-black text-white font-mono">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="dash-grid mt-12 bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
        <div className="grid-header px-6"><span>Descripción Detallada</span><span className="text-center">Cant.</span><span>Precio Unitario (Editable)</span><span className="text-right">Subtotal</span><span className="text-center">Acciones</span></div>
        {space.items.map(item => (
          <div key={item.id} className="grid-row px-6">
            <div className="cell-name"><span className="text-lg block font-bold">{item.item_name}</span><p className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">{item.detail || 'ESPECIFICACIÓN ESTÁNDAR'}</p></div>
            <div className="cell-qty text-center font-black text-4xl text-blue-600 font-mono">{item.quantity}</div>
            <div className="cell-price"><div className="price-input-wrapper"><input type="number" className="price-input" value={item.price} onChange={(e) => onUpdatePrice(item.id, e.target.value)} /></div></div>
            <div className="cell-subtotal text-right font-black text-2xl text-emerald-600 font-mono">{formatCurrency(item.price * item.quantity)}</div>
            <div className="flex justify-center gap-3">
              <button onClick={() => onUpdateQuantity(item.id, -1, item.quantity)} className="w-10 h-10 rounded-lg border-2 border-slate-200 text-slate-400 hover:border-red-500 hover:text-red-500 transition-all flex items-center justify-center"><Minus size={18} /></button>
              <button onClick={() => onUpdateQuantity(item.id, 1, item.quantity)} className="w-10 h-10 rounded-lg border-2 border-slate-200 text-slate-400 hover:border-emerald-500 hover:text-emerald-500 transition-all flex items-center justify-center"><Plus size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
