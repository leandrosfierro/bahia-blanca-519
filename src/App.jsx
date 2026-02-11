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

    // Optimistic Update
    setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: nextQty } : item));

    const { error } = await supabase.from('inventory').update({ quantity: nextQty }).eq('id', id);
    if (error) fetchData(); // Revert on error
  };

  const handleUpdatePrice = async (id, newPrice) => {
    const priceVal = parseFloat(newPrice);
    if (isNaN(priceVal)) return;

    // Optimistic Update
    setItems(prev => prev.map(item => item.id === id ? { ...item, price: priceVal } : item));

    // Debounce the Supabase update (simple implementation)
    const { error } = await supabase.from('inventory').update({ price: priceVal }).eq('id', id);
    // No need to revert unless there's a serious error, as the user might still be typing
  };

  const handleDeleteItem = async (id, itemName) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente "${itemName}" del inventario?`)) {
      // Optimistic Delete
      setItems(prev => prev.filter(item => item.id !== id));
      await supabase.from('inventory').delete().eq('id', id);
    }
  };

  const handleAddItem = async (floor, space, newItem) => {
    const itemToInsert = {
      floor,
      space,
      item_name: newItem.item_name,
      detail: newItem.detail,
      quantity: parseInt(newItem.quantity) || 1,
      price: parseFloat(newItem.price) || 0,
      image_url: newItem.image_url
    };

    // Optimistic Update (Temporary ID)
    const tempId = Date.now();
    setItems(prev => [...prev, { ...itemToInsert, id: tempId }]);

    const { data, error } = await supabase.from('inventory').insert(itemToInsert).select();

    if (error) {
      alert("Error al agregar ítem: " + error.message);
      fetchData(); // Rollback/Refresh
    } else if (data && data[0]) {
      // Replace optimistic item with real one from DB (to get the real ID)
      setItems(prev => prev.map(it => it.id === tempId ? data[0] : it));
    }
  };

  const handleUpdateImage = async (floor, space, file) => {
    if (!file) return;
    setSyncing(true);
    try {
      // Limpiar el nombre del archivo de acentos y caracteres especiales (Ej: Recepción -> Recepcion)
      const cleanSpace = space.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "-");
      const cleanFloor = floor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "-");

      const fileExt = file.name.split('.').pop();
      const fileName = `${cleanFloor}-${cleanSpace}-${Date.now()}.${fileExt}`;
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
    const date = new Date().toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // --- CARATULA / PORTADA ---
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 40, 'F');

    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    doc.text('Bahía Blanca 519', 14, 20);
    doc.setFontSize(12);
    doc.text('INFORME TÉCNICO DE ACTIVOS E INVENTARIO', 14, 30);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(`FECHA DE GENERACIÓN: ${date}`, 14, 50);

    // Cuadro de Resumen Ejecutivo
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 55, 182, 35, 3, 3, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('INVERSIÓN TOTAL PROYECTADA', 20, 65);
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235); // Blue 600
    doc.text(formatCurrency(grandTotal), 20, 75);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('CANTIDAD DE ACTIVOS', 130, 65);
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalItemsCount} unidades`, 130, 75);
    doc.text(`Distribuido en ${inventory.length} espacios`, 130, 82);

    // Tabla de Resumen por Áreas
    const summaryData = inventory.map(space => [
      { content: `PISO ${space.floor}`, styles: { fontStyle: 'bold' } },
      space.space,
      { content: space.items.length, styles: { halign: 'center' } },
      { content: formatCurrency(space.items.reduce((a, i) => a + (i.price * i.quantity), 0)), styles: { halign: 'right', fontStyle: 'bold' } }
    ]);

    doc.autoTable({
      startY: 100,
      head: [['NIVEL', 'ESPACIO / OFICINA', 'CANT. ITEMS', 'SUBTOTAL ARS']],
      body: summaryData,
      theme: 'striped',
      headStyles: {
        fillColor: [15, 23, 42],
        fontSize: 10,
        halign: 'center'
      },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        3: { halign: 'right' }
      }
    });

    // --- DETALLE POR CADA ESPACIO ---
    inventory.forEach((space) => {
      doc.addPage();

      // Header de Sección
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, 210, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text(`${space.space.toUpperCase()} - DETALLE TÉCNICO`, 14, 16);

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      const spaceTotal = space.items.reduce((a, i) => a + (i.price * i.quantity), 0);
      doc.text(`UBICACIÓN: Piso ${space.floor}`, 14, 35);
      doc.text(`VALORIZACIÓN DEL ÁREA: ${formatCurrency(spaceTotal)}`, 14, 42);

      const itemsData = space.items.map(item => [
        item.item_name,
        item.detail || '-',
        { content: item.quantity, styles: { halign: 'center' } },
        { content: formatCurrency(item.price), styles: { halign: 'right' } },
        { content: formatCurrency(item.price * item.quantity), styles: { halign: 'right', fontStyle: 'bold' } }
      ]);

      doc.autoTable({
        startY: 50,
        head: [['ITEM', 'ESPECIFICACIÓN / DETALLE', 'CANT.', 'PRECIO UNIT.', 'SUBTOTAL']],
        body: itemsData,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 35 }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      // Pie de página con numeración
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Bahía Blanca 519 - Página ${pageCount}`, 190, 285, { align: 'right' });
    });

    doc.save(`INFORME_INVENTARIO_BB519_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Hoja de Resumen General (Vista Gerencial)
    const summarySheetData = inventory.map(space => ({
      'Nivel/Piso': space.floor,
      'Espacio / Oficina': space.space,
      'Cantidad de Activos': space.items.length,
      'Subtotal Inversión (ARS)': space.items.reduce((a, i) => a + (i.price * i.quantity), 0)
    }));

    // Fila de Total General al final del resumen
    summarySheetData.push({
      'Nivel/Piso': '',
      'Espacio / Oficina': 'TOTAL GENERAL EDIFICIO',
      'Cantidad de Activos': totalItemsCount,
      'Subtotal Inversión (ARS)': grandTotal
    });

    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);

    // Estilo de columnas (ancho)
    const wscolsSummary = [
      { wch: 15 },
      { wch: 30 },
      { wch: 20 },
      { wch: 25 }
    ];
    wsSummary['!cols'] = wscolsSummary;
    XLSX.utils.book_append_sheet(wb, wsSummary, "RESUMEN EJECUTIVO");

    // 2. Hoja de Detalle Completo (Para auditoría)
    const detailSheetData = items.map(item => ({
      'Piso': item.floor,
      'Ambiente': item.space,
      'Descripción del Activo': item.item_name,
      'Especificación Técnica': item.detail || '-',
      'Cantidad': item.quantity,
      'Valor Unitario (ARS)': item.price,
      'Impacto Total (ARS)': item.price * item.quantity
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailSheetData);
    const wscolsDetail = [
      { wch: 10 },
      { wch: 25 },
      { wch: 35 },
      { wch: 45 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 }
    ];
    wsDetail['!cols'] = wscolsDetail;
    XLSX.utils.book_append_sheet(wb, wsDetail, "INVENTARIO DETALLADO");

    // 3. Generar archivo descarga
    XLSX.writeFile(wb, `ESTADO_ACTIVOS_BB519_${new Date().toISOString().split('T')[0]}.xlsx`);
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

            <div className="mb-12 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-black text-slate-900 uppercase">Resumen por Áreas</h3>
                <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest">Descarga de reportes técnicos actualizados</p>
              </div>
              <div className="flex gap-4">
                <button onClick={exportPDF} className="export-btn-v2 pdf">
                  <FileText size={20} />
                  Generar PDF Profesional
                </button>
                <button onClick={exportExcel} className="export-btn-v2 excel">
                  <TableIcon size={20} />
                  Descargar Excel Detallado
                </button>
              </div>
            </div>

            <div className="summary-grid">
              {inventory.map(space => {
                const spaceTotal = space.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                const currentImg = space.image_url || DEFAULT_FOTOREF;
                return (
                  <div key={`${space.floor}-${space.space}`} className="summary-card-v2" onClick={() => { setSelectedSpaceId(`${space.floor}-${space.space}`); setView('operational'); }}>
                    <div className="relative group/thumb mb-4">
                      <img
                        src={currentImg}
                        className="mini-thumb !mb-0"
                        alt=""
                        onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_FOTOREF; }}
                      />
                      <label
                        className="absolute bottom-2 right-2 bg-white/90 p-2 rounded-lg shadow-xl cursor-pointer hover:bg-blue-600 hover:text-white transition-all backdrop-blur-sm border border-slate-200"
                        title="Cambiar Foto"
                        onClick={e => e.stopPropagation()}
                      >
                        <Camera size={16} />
                        <input type="file" className="hidden" accept="image/*" onChange={e => handleUpdateImage(space.floor, space.space, e.target.files[0])} />
                      </label>
                    </div>
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
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 size={18} className="text-white" />
            </div>
            <label
              className="absolute bottom-2 right-2 z-10 bg-white shadow-2xl p-2 rounded-lg cursor-pointer hover:bg-blue-600 hover:text-white transition-all border border-slate-100"
              title="Cambiar Foto"
              onClick={e => e.stopPropagation()}
            >
              <Camera size={14} />
              <input type="file" className="hidden" accept="image/*" onChange={e => onImageUpload(space.floor, space.space, e.target.files[0])} />
            </label>
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
