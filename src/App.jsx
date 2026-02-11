import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import inventoryData from './data/inventory.json';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Building2,
  Search,
  Plus,
  Minus,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  Box,
  Download,
  Camera,
  Layers,
  MapPin,
  PieChart,
  Settings,
  RefreshCw,
  CloudCheck,
  Maximize2,
  X,
  Trash2,
  ArrowRight,
  FileText,
  Table as TableIcon,
  Check,
  Plus as PlusIcon,
  AlertCircle
} from 'lucide-react';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(val || 0);
};

// Default images based on project availability
const DEFAULT_FOTOREF = '/office_building_facade.png';

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState('summary');
  const [selectedFloor, setSelectedFloor] = useState('All');
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFloors, setExpandedFloors] = useState(['PB', '1', '2', 'IT']);
  const [selectedImage, setSelectedImage] = useState(null);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('floor', { ascending: true })
      .order('item_name', { ascending: true });
    if (!error) setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('schema-changes')
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
    await supabase.from('inventory').insert(flatItems);
    fetchData();
    setSyncing(false);
  };

  const handleUpdateQuantity = async (id, itemName, delta, currentQty) => {
    const nextQty = currentQty + delta;
    if (nextQty <= 0) {
      handleDeleteItem(id, itemName);
      return;
    }
    await supabase.from('inventory').update({ quantity: nextQty }).eq('id', id);
  };

  const handleUpdatePrice = async (id, newPrice) => {
    const priceVal = parseFloat(newPrice) || 0;
    await supabase.from('inventory').update({ price: priceVal }).eq('id', id);
  };

  const handleDeleteItem = async (id, itemName) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente "${itemName}" del inventario?`)) {
      await supabase.from('inventory').delete().eq('id', id);
    }
  };

  const handleAddItem = async (floor, space, newItem) => {
    const { error } = await supabase.from('inventory').insert({
      floor,
      space,
      item_name: newItem.item_name,
      detail: newItem.detail,
      quantity: parseInt(newItem.quantity) || 1,
      price: parseFloat(newItem.price) || 0,
      image_url: newItem.image_url
    });
    if (error) alert("Error al agregar ítem: " + error.message);
  };

  const handleUpdateImage = async (floor, space, file) => {
    if (!file) return;
    setSyncing(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${floor}-${space}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('space-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('space-images')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ image_url: publicUrl })
        .eq('floor', floor)
        .eq('space', space);

      if (updateError) throw updateError;

      fetchData();
    } catch (err) {
      alert("Error con la imagen: " + err.message + "\n\nVerifique que creó el bucket 'space-images' en Supabase y que es público.");
    } finally {
      setSyncing(false);
    }
  };

  const inventory = useMemo(() => {
    const grouped = items.reduce((acc, item) => {
      const key = `${item.floor}-${item.space}`;
      if (!acc[key]) acc[key] = { floor: item.floor, space: item.space, image_url: item.image_url, items: [] };
      acc[key].items.push(item);
      if (item.image_url && !acc[key].image_url) acc[key].image_url = item.image_url;
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
  const totalItemsCount = useMemo(() => items.reduce((acc, item) => acc + item.quantity, 0), [items]);

  const exportPDF = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text('Bahía Blanca 519 - Informe de Inventario', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado el: ${date}`, 14, 28);
    doc.text(`Inversión Total: ${formatCurrency(grandTotal)}`, 14, 34);
    const summaryData = inventory.map(space => [
      `Piso ${space.floor}`,
      space.space,
      space.items.length,
      formatCurrency(space.items.reduce((a, i) => a + (i.price * i.quantity), 0))
    ]);
    doc.autoTable({
      startY: 45,
      head: [['Nivel', 'Espacio', 'Ítems', 'Subtotal']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
    });
    inventory.forEach((space) => {
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(37, 99, 235);
      doc.text(`Detalle: ${space.space} (Piso ${space.floor})`, 14, 20);
      const spaceTotal = space.items.reduce((a, i) => a + (i.price * i.quantity), 0);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Valor Total del Área: ${formatCurrency(spaceTotal)}`, 14, 28);
      const itemsData = space.items.map(item => [
        item.item_name,
        item.detail || '-',
        item.quantity,
        formatCurrency(item.price),
        formatCurrency(item.price * item.quantity)
      ]);
      doc.autoTable({
        startY: 35,
        head: [['Ítem', 'Detalle', 'Cant.', 'Precio Unit.', 'Subtotal']],
        body: itemsData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      });
    });
    doc.save(`INFORME_BB519_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportExcel = () => {
    const summarySheetData = inventory.map(space => ({
      Nivel: space.floor,
      Espacio: space.space,
      'Cant. Items': space.items.length,
      Total: space.items.reduce((a, i) => a + (i.price * i.quantity), 0)
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summarySheetData);
    const detailSheetData = items.map(item => ({
      Nivel: item.floor,
      Espacio: item.space,
      Ítem: item.item_name,
      Detalle: item.detail || '',
      Cantidad: item.quantity,
      'Precio Unitario': item.price,
      Subtotal: item.price * item.quantity
    }));
    const detailWs = XLSX.utils.json_to_sheet(detailSheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summaryWs, "Resumen de Áreas");
    XLSX.utils.book_append_sheet(wb, detailWs, "Detalle de Activos");
    XLSX.writeFile(wb, `REPORTE_TECNICO_BB519.xlsx`);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-900"><RefreshCw className="animate-spin text-white" size={48} /></div>;

  return (
    <div className="flex bg-[#f8fafc] min-h-screen">
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-8 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} className="max-w-[90%] max-h-[90%] rounded-2xl object-contain border-4 border-white/10 shadow-2xl" alt="" />
          <button className="absolute top-8 right-8 text-white/50 hover:text-white transition-all"><X size={48} /></button>
        </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Building2 size={22} /></div>
            <div><h1 className="text-lg font-black tracking-tighter text-slate-900">BB 519</h1><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DASHBOARD</span></div>
          </div>
        </div>
        <div className="sidebar-content">
          <button onClick={() => setView('summary')} className={`nav-item mb-2 ${view === 'summary' ? 'active' : ''}`}><PieChart size={18} />Resumen General</button>
          <button onClick={() => setView('operational')} className={`nav-item mb-6 ${view === 'operational' ? 'active' : ''}`}><LayoutGrid size={18} />Vista Operativa</button>
          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estructura</p>
          {['PB', '1', '2', 'IT'].map(floor => (
            <div key={floor} className="nav-group">
              <button onClick={() => { setExpandedFloors(prev => prev.includes(floor) ? prev.filter(f => f !== floor) : [...prev, floor]); setSelectedFloor(floor); setView('operational'); }} className={`nav-item justify-between ${selectedFloor === floor ? 'active' : ''}`}>
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
            <button onClick={seedDatabase} className="w-full bg-blue-600 text-white p-3 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2"><RefreshCw size={14} />Inicializar Cloud</button>
          ) : (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center gap-2 text-emerald-600">
              {syncing ? <RefreshCw className="animate-spin" size={18} /> : <CloudCheck size={18} />}
              <span className="text-[10px] font-black uppercase">{syncing ? 'Sincronizando...' : 'Online'}</span>
            </div>
          )}
        </div>
      </aside>

      <main className="main-layout flex-1">
        {view === 'summary' ? (
          <div className="animate-in fade-in duration-500">
            <div className="grand-total-section">
              <span className="label">Informe de Inversión Bahía Blanca 519</span>
              <h1 className="value">{formatCurrency(grandTotal)}</h1>
              <div className="flex justify-center gap-8 mt-6">
                <div className="bg-white/10 px-4 py-2 rounded-xl text-xs font-bold">{totalItemsCount} ACTIVOS</div>
                <div className="bg-white/10 px-4 py-2 rounded-xl text-xs font-bold">{inventory.length} ESPACIOS</div>
              </div>
            </div>

            <div className="mb-8 flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900 uppercase">Resumen por Áreas</h3>
              <div className="flex gap-4">
                <button onClick={exportPDF} className="bg-white border-2 border-slate-200 px-6 py-3 rounded-2xl font-black text-xs uppercase text-slate-600 hover:border-red-500 hover:text-red-500 flex items-center gap-2 transition-all"><FileText size={16} /> PDF Profesional</button>
                <button onClick={exportExcel} className="bg-white border-2 border-slate-200 px-6 py-3 rounded-2xl font-black text-xs uppercase text-slate-600 hover:border-emerald-500 hover:text-emerald-500 flex items-center gap-2 transition-all"><TableIcon size={16} /> Excel Detallado</button>
              </div>
            </div>

            <div className="summary-grid">
              {inventory.map(space => {
                const spaceTotal = space.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                const currentImg = space.image_url || DEFAULT_FOTOREF;
                return (
                  <div key={`${space.floor}-${space.space}`} className="summary-card-v2" onClick={() => { setSelectedSpaceId(`${space.floor}-${space.space}`); setView('operational'); }}>
                    <img
                      src={currentImg}
                      className="mini-thumb"
                      alt=""
                      onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_FOTOREF; }}
                    />
                    <span className="floor-tag">PISO {space.floor}</span>
                    <h4 className="space-name">{space.space}</h4>
                    <p className="amount-display">{formatCurrency(spaceTotal)}</p>
                    <div className="footer-stats">
                      <span className="item-pill">{space.items.length} ITEMS</span>
                      <ArrowRight size={16} className="text-slate-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between gap-8 mb-12">
              <div className="flex-1 bg-white border-2 border-slate-100 rounded-3xl p-3 flex items-center gap-4 shadow-xl"><Search size={22} className="text-slate-400" /><input type="text" placeholder="Buscar en inventario..." className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
              <div className="bg-emerald-600 text-white px-8 py-4 rounded-3xl font-black text-2xl font-mono shadow-xl">{formatCurrency(filteredInventory.reduce((a, s) => a + s.items.reduce((si, i) => si + (i.price * i.quantity), 0), 0))}</div>
            </div>
            {filteredInventory.map(space => (
              <DashboardSpaceRow
                key={`${space.floor}-${space.space}`}
                space={space}
                onUpdateQuantity={handleUpdateQuantity}
                onUpdatePrice={handleUpdatePrice}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                onImageUpload={handleUpdateImage}
                onEnlarge={url => setSelectedImage(url)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DashboardSpaceRow({ space, onUpdateQuantity, onUpdatePrice, onDeleteItem, onAddItem, onImageUpload, onEnlarge }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({ item_name: '', detail: '', quantity: 1, price: 0 });

  const total = space.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const currentImg = space.image_url || DEFAULT_FOTOREF;

  const handleSaveNewItem = () => {
    if (!newItem.item_name) {
      alert("Por favor ingrese el nombre del item.");
      return;
    }
    onAddItem(space.floor, space.space, { ...newItem, image_url: space.image_url });
    setNewItem({ item_name: '', detail: '', quantity: 1, price: 0 });
    setIsAdding(false);
  };

  return (
    <div className="dash-card border-l-8 border-l-blue-500">
      <div className="dash-header items-center">
        <div className="flex gap-8 items-center">
          <div className="group row-thumbnail-wrapper cursor-pointer" onClick={() => onEnlarge(currentImg)}>
            <img
              src={currentImg}
              className="group-hover:scale-110"
              alt=""
              onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_FOTOREF; }}
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={18} className="text-white" /></div>
            <label className="absolute bottom-1 right-1 bg-white p-2 rounded-md shadow-lg cursor-pointer hover:bg-blue-50 transition-colors" title="Cambiar Foto" onClick={e => e.stopPropagation()}><Camera size={14} className="text-blue-600" /><input type="file" className="hidden" accept="image/*" onChange={e => onImageUpload(space.floor, space.space, e.target.files[0])} /></label>
          </div>
          <div><p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">PISO {space.floor}</p><div className="flex items-center gap-4"><h2 className="text-4xl font-black text-slate-900 leading-none">{space.space}</h2><button onClick={() => setIsAdding(!isAdding)} className={`p-2 rounded-lg transition-all ${isAdding ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'}`} title="Agregar Nuevo Item">{isAdding ? <X size={20} /> : <PlusIcon size={20} />}</button></div><p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest"><MapPin size={12} className="inline mr-1" /> Bahía Blanca 519 | {space.items.length} ACTIVOS CLOUD</p></div>
        </div>
        <div className="total-pill bg-slate-900 p-6 rounded-3xl text-right scale-110"><span className="text-[10px] font-black text-blue-400 uppercase block mb-1 tracking-widest">TOTAL ÁREA</span><span className="text-3xl font-black text-white font-mono">{formatCurrency(total)}</span></div>
      </div>

      <div className="dash-grid mt-10 bg-slate-50/50 rounded-2xl p-6 border border-slate-100">
        <div className="grid-header px-4"><span>Ítem Inventariado</span><span className="text-center">Cant.</span><span>Precio Unit.</span><span className="text-right">Subtotal</span><span className="text-center">Acciones</span></div>

        {isAdding && (
          <div className="grid-row px-4 bg-blue-50/50 border-2 border-blue-200 rounded-xl mb-4 animate-in slide-in-from-top-2 duration-300">
            <div className="cell-name pr-4">
              <input type="text" placeholder="Nombre del nuevo ítem..." className="w-full bg-white border-2 border-slate-200 p-2 rounded-lg font-bold text-slate-800 outline-none focus:border-blue-500" value={newItem.item_name} onChange={e => setNewItem({ ...newItem, item_name: e.target.value })} />
              <input type="text" placeholder="Detalle técnico (opcional)..." className="w-full bg-white border-2 border-slate-100 p-1.5 rounded-lg text-xs mt-2 outline-none focus:border-blue-300" value={newItem.detail} onChange={e => setNewItem({ ...newItem, detail: e.target.value })} />
            </div>
            <div className="cell-qty flex justify-center">
              <input type="number" className="w-20 text-center bg-white border-2 border-slate-200 p-2 rounded-lg font-black text-blue-600" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} min="1" />
            </div>
            <div className="cell-price px-4 flex justify-center">
              <div className="price-input-wrapper">
                <input type="number" className="price-input bg-white border-2 border-blue-200" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} />
              </div>
            </div>
            <div className="cell-subtotal text-right font-black text-xl text-emerald-600 font-mono">
              {formatCurrency(newItem.price * newItem.quantity)}
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={handleSaveNewItem} className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 hover:scale-105 transition-all"><Check size={24} /></button>
            </div>
          </div>
        )}

        {space.items.map(item => (
          <div key={item.id} className="grid-row px-4">
            <div className="cell-name"><span className="text-base block font-bold">{item.item_name}</span><p className="text-[10px] uppercase opacity-60 font-bold">{item.detail || 'ESPECIFICACIÓN ESTÁNDAR'}</p></div>
            <div className="cell-qty text-center font-black text-3xl text-blue-600 font-mono">{item.quantity}</div>
            <div className="cell-price px-4"><div className="price-input-wrapper"><input type="number" className="price-input" value={item.price} onChange={e => onUpdatePrice(item.id, e.target.value)} /></div></div>
            <div className="cell-subtotal text-right font-black text-xl text-emerald-600 font-mono">{formatCurrency(item.price * item.quantity)}</div>
            <div className="flex justify-center gap-3">
              <button onClick={() => onUpdateQuantity(item.id, item.item_name, -1, item.quantity)} className="w-10 h-10 rounded-lg border-2 border-slate-200 text-slate-400 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center transition-all bg-white"><Minus size={16} /></button>
              <button onClick={() => onUpdateQuantity(item.id, item.item_name, 1, item.quantity)} className="w-10 h-10 rounded-lg border-2 border-slate-200 text-slate-400 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center transition-all bg-white"><PlusIcon size={16} /></button>
              <button onClick={() => onDeleteItem(item.id, item.item_name)} className="ml-2 w-10 h-10 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all border border-red-100"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
