import React, { useState, useMemo, useEffect } from 'react';
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
  Settings
} from 'lucide-react';

const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(val);
};

function App() {
  // Persistence Logic
  const getInitialData = () => {
    const saved = localStorage.getItem('bb519-inventory-v4');
    return saved ? JSON.parse(saved) : inventoryData;
  };

  const [inventory, setInventory] = useState(getInitialData);
  const [view, setView] = useState('summary'); // 'summary' or 'operational'
  const [selectedFloor, setSelectedFloor] = useState('All');
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFloors, setExpandedFloors] = useState(['PB', '1', '2', 'IT']);

  // Auto-save on every change
  useEffect(() => {
    localStorage.setItem('bb519-inventory-v4', JSON.stringify(inventory));
  }, [inventory]);

  const floors = ['PB', '1', '2', 'IT'];

  const toggleFloor = (floor) => {
    setExpandedFloors(prev =>
      prev.includes(floor) ? prev.filter(f => f !== floor) : [...prev, floor]
    );
  };

  const handleUpdateQuantity = (itemId, delta) => {
    setInventory(prev => prev.map(space => ({
      ...space,
      items: space.items.map(item => {
        if (item.id === itemId) {
          const nextQty = Math.max(0, item.quantity + delta);
          return { ...item, quantity: nextQty };
        }
        return item;
      })
    })));
  };

  const handleUpdatePrice = (itemId, newPrice) => {
    const priceVal = parseFloat(newPrice) || 0;
    setInventory(prev => prev.map(space => ({
      ...space,
      items: space.items.map(item => {
        if (item.id === itemId) {
          return { ...item, price: priceVal };
        }
        return item;
      })
    })));
  };

  const filteredInventory = useMemo(() => {
    let result = inventory;

    if (selectedFloor !== 'All') {
      result = result.filter(s => s.floor === selectedFloor);
    }

    if (selectedSpaceId) {
      result = result.filter(s => `${s.floor}-${s.space}` === selectedSpaceId);
    }

    if (searchTerm) {
      result = result.filter(space =>
        space.space.toLowerCase().includes(searchTerm.toLowerCase()) ||
        space.items.some(item =>
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.detail && item.detail.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      );
    }

    return result;
  }, [inventory, selectedFloor, selectedSpaceId, searchTerm]);

  const grandTotal = useMemo(() => {
    return inventory.reduce((acc, space) => {
      return acc + space.items.reduce((sAcc, item) => sAcc + (item.price * item.quantity), 0);
    }, 0);
  }, [inventory]);

  const totalItemsCount = useMemo(() => {
    return inventory.reduce((acc, space) => {
      return acc + space.items.reduce((sAcc, item) => sAcc + item.quantity, 0);
    }, 0);
  }, [inventory]);

  const handleExportCSV = () => {
    const headers = ['Piso', 'Espacio', 'Item', 'Detalle', 'Precio', 'Cantidad', 'Subtotal'];
    const rows = filteredInventory.flatMap(space =>
      space.items.map(item => [
        space.floor, space.space, item.name, item.detail || '', item.price, item.quantity, item.price * item.quantity
      ])
    );
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `REPORT_BB519_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  return (
    <div className="flex bg-[#f8fafc] min-h-screen">
      {/* SIDEBAR DASHBOARD */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter text-slate-900 leading-tight">BB 519</h1>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Control Operativo</span>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Vistas Principales</p>

          <button
            onClick={() => { setView('summary'); setSelectedFloor('All'); setSelectedSpaceId(null); }}
            className={`nav-item mb-2 ${view === 'summary' ? 'active' : ''}`}
          >
            <PieChart size={18} />
            Tablero de Resumen
          </button>

          <button
            onClick={() => { setView('operational'); setSelectedFloor('All'); setSelectedSpaceId(null); }}
            className={`nav-item mb-6 ${view === 'operational' && selectedFloor === 'All' ? 'active' : ''}`}
          >
            <LayoutGrid size={18} />
            Inventario Detallado
          </button>

          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estructura Edilicia</p>

          {floors.map(floor => (
            <div key={floor} className="nav-group">
              <button
                onClick={() => { toggleFloor(floor); setSelectedFloor(floor); setSelectedSpaceId(null); setView('operational'); }}
                className={`nav-item justify-between ${selectedFloor === floor && !selectedSpaceId ? 'active' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Layers size={18} />
                  <span>PISO {floor}</span>
                </div>
                {expandedFloors.includes(floor) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {expandedFloors.includes(floor) && (
                <div className="mt-1">
                  {inventory.filter(s => s.floor === floor).map(space => (
                    <button
                      key={`${space.floor}-${space.space}`}
                      onClick={() => { setSelectedSpaceId(`${space.floor}-${space.space}`); setSelectedFloor(floor); setView('operational'); }}
                      className={`nav-sub-item ${selectedSpaceId === `${space.floor}-${space.space}` ? 'active' : ''}`}
                    >
                      {space.space}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider">Sistema Activo</span>
            </div>
            <Settings size={14} className="text-slate-400 cursor-pointer hover:text-slate-600" />
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-layout flex-1">

        {view === 'summary' ? (
          /* SUMMARY VIEW */
          <div className="animate-in fade-in duration-500">
            <div className="grand-total-section">
              <span className="label">Inversión Total Edificio Bahía Blanca 519</span>
              <span className="value">{formatCurrency(grandTotal)}</span>
              <div className="mt-8 flex justify-center gap-12">
                <div>
                  <p className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] mb-1">Activos Registrados</p>
                  <p className="text-3xl font-black">{totalItemsCount}</p>
                </div>
                <div className="w-px h-12 bg-white/20" />
                <div>
                  <p className="text-[10px] font-black opacity-40 uppercase tracking-[0.3em] mb-1">Espacios Supervisados</p>
                  <p className="text-3xl font-black">{inventory.length}</p>
                </div>
              </div>
            </div>

            <div className="mb-8 flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Desglose por Áreas</h3>
              <button
                onClick={handleExportCSV}
                className="bg-white border-2 border-slate-200 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 hover:border-blue-500 hover:text-blue-500 transition-all flex items-center gap-3"
              >
                <Download size={16} /> Descargar Reporte Completo
              </button>
            </div>

            <div className="summary-grid">
              {inventory.map(space => {
                const spaceTotal = space.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                return (
                  <div key={`${space.floor}-${space.space}`} className="summary-card group hover:border-blue-200 transition-all hover:shadow-xl hover:shadow-blue-500/5 cursor-pointer" onClick={() => { setSelectedSpaceId(`${space.floor}-${space.space}`); setSelectedFloor(space.floor); setView('operational'); }}>
                    <h4>PISO {space.floor}</h4>
                    <p className="space-title">{space.space}</p>
                    <div className="flex justify-between items-end">
                      <p className="space-total">{formatCurrency(spaceTotal)}</p>
                      <div className="bg-slate-50 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                        {space.items.length} ITEMS
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* OPERATIONAL VIEW */
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-12 gap-8">
              <div className="flex-1 max-w-3xl bg-white border-2 border-slate-100 rounded-3xl p-2.5 flex items-center gap-4 shadow-xl shadow-slate-200/50">
                <div className="bg-slate-50 p-2.5 rounded-2xl text-slate-400">
                  <Search size={22} />
                </div>
                <input
                  type="text"
                  placeholder="Filtrar activos detallados..."
                  className="flex-1 bg-transparent border-none outline-none text-base font-bold text-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="bg-slate-900 text-white px-8 py-4 rounded-3xl shadow-xl flex items-center gap-6">
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-0.5">Subtotal Vista</p>
                  <p className="text-2xl font-black leading-none font-mono">
                    {formatCurrency(filteredInventory.reduce((acc, s) => acc + s.items.reduce((si, i) => si + (i.price * i.quantity), 0), 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-12">
              {filteredInventory.map(space => (
                <DashboardSpaceRow
                  key={`${space.floor}-${space.space}`}
                  space={space}
                  onUpdateQuantity={handleUpdateQuantity}
                  onUpdatePrice={handleUpdatePrice}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DashboardSpaceRow({ space, onUpdateQuantity, onUpdatePrice }) {
  const storageKey = `space-img-v4-${space.floor}-${space.space}`;
  const [customImage, setCustomImage] = useState(localStorage.getItem(storageKey));

  const total = space.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        setCustomImage(base64String);
        localStorage.setItem(storageKey, base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const currentImg = useMemo(() => {
    if (customImage) return customImage;
    if (space.floor === 'PB') return '/Planta baja general.png';
    if (space.floor === '1') return '/Planta piso 1.png';
    if (space.floor === '2') return '/Planta piso 2.png';
    return '/office_building_facade.png';
  }, [customImage, space.floor]);

  return (
    <div className="dash-card border-l-8 border-l-blue-500">
      <div className="dash-header items-center">
        <div className="flex gap-8 items-center">
          <div className="thumbnail-container group relative flex-shrink-0">
            <img src={currentImg} alt={space.space} />
            <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Camera size={20} className="text-white" />
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>

          <div className="title-section">
            <p className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              PISO {space.floor === 'IT' ? 'INFRAESTRUCTURA IT' : space.floor}
            </p>
            <h2 className="text-4xl font-black">{space.space}</h2>
            <div className="flex items-center gap-3 mt-3 text-slate-400 font-bold text-[11px] uppercase tracking-widest">
              <MapPin size={16} className="text-blue-500" />
              Bahía Blanca 519
              <span className="mx-2 text-slate-200">|</span>
              {space.items.length} Activos
            </div>
          </div>
        </div>

        <div className="total-pill bg-slate-900 border-4 border-white shadow-2xl scale-110">
          <span className="label text-blue-400">TOTAL ESTE AREA</span>
          <span className="value text-white">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="dash-grid mt-12 bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
        <div className="grid-header px-6">
          <span>Descripción</span>
          <span className="text-center">Cant.</span>
          <span>Precio (Editable)</span>
          <span className="text-right">Subtotal</span>
          <span className="text-center">Operar</span>
        </div>

        {space.items.map(item => (
          <div key={item.id} className="grid-row px-6 border-slate-100 last:border-none">
            <div className="cell-name pr-8">
              <span className="text-lg block">{item.name}</span>
              <p className="text-[11px] mt-1 uppercase tracking-wider opacity-60">{item.detail || 'Standard Specification'}</p>
            </div>

            <div className="cell-qty text-center big-num text-blue-600">
              {item.quantity}
            </div>

            <div className="cell-price">
              <div className="price-input-wrapper">
                <input
                  type="number"
                  className="price-input"
                  value={item.price}
                  onChange={(e) => onUpdatePrice(item.id, e.target.value)}
                />
              </div>
            </div>

            <div className="cell-subtotal text-right font-black text-2xl text-emerald-600 font-mono">
              {formatCurrency(item.price * item.quantity)}
            </div>

            <div className="flex justify-center gap-3">
              <button onClick={() => onUpdateQuantity(item.id, -1)} className="w-12 h-12 rounded-xl bg-white text-slate-400 hover:bg-red-50 hover:text-red-600 border-2 border-slate-100 shadow-sm transition-all"><Minus size={20} strokeWidth={3} /></button>
              <button onClick={() => onUpdateQuantity(item.id, 1)} className="w-12 h-12 rounded-xl bg-white text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 border-2 border-slate-100 shadow-sm transition-all"><Plus size={20} strokeWidth={3} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
