import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const result = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    throw new Error(result?.error || `Request failed (${response.status}).`)
  }
  return result
}

function App() {
  const [page, setPage] = useState('dashboard')
  const [products, setProducts] = useState([])
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [search, setSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [editingStockId, setEditingStockId] = useState(null)
  const [stockValue, setStockValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await request('/api/products')
      setProducts(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let current = true
    request('/api/products')
      .then(result => {
        if (current) setProducts(result)
      })
      .catch(requestError => {
        if (current) setError(requestError.message)
      })
      .finally(() => {
        if (current) setLoading(false)
      })

    return () => {
      current = false
    }
  }, [])

  const filteredProducts = useMemo(() => products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.category.toLowerCase().includes(search.toLowerCase())
  ), [products, search])

  const lowStock = products.filter(product => product.stock < 10).length
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0)
  const inventoryValue = products.reduce(
    (sum, product) => sum + product.price * product.stock,
    0,
  )

  function resetForm() {
    setName('')
    setCategory('')
    setPrice('')
    setStock('')
    setEditingProduct(null)
  }

  function startEditing(product) {
    setName(product.name)
    setCategory(product.category)
    setPrice(String(product.price))
    setStock(String(product.stock))
    setEditingProduct(product)
    setPage('dashboard')
    setError('')
    setNotice('')
  }

  async function saveProduct(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const product = {
        name: name.trim(),
        category: category.trim(),
        price: Number(price),
        stock: Number(stock),
      }
      const path = editingProduct
        ? `/api/products/${editingProduct.id}`
        : '/api/products'
      await request(path, {
        method: editingProduct ? 'PUT' : 'POST',
        body: JSON.stringify(product),
      })
      resetForm()
      await loadProducts()
      setNotice(editingProduct
        ? 'Product and stock updated in the database.'
        : 'Product added to the database.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete "${product.name}" from the inventory?`)) return

    setDeletingId(product.id)
    setError('')
    setNotice('')
    try {
      await request(`/api/products/${product.id}`, { method: 'DELETE' })
      if (editingProduct?.id === product.id) resetForm()
      await loadProducts()
      setNotice('Product deleted from the database.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingId(null)
    }
  }

  async function saveStock(product) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await request(`/api/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: product.name,
          category: product.category,
          price: product.price,
          stock: Number(stockValue),
        }),
      })
      setEditingStockId(null)
      await loadProducts()
      setNotice(`Stock for ${product.name} updated in the database.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h2>📦 StockWise</h2>
          <p>Inventory Management</p>
        </div>
        <nav aria-label="Main navigation">
          {[
            ['dashboard', '▦', 'Dashboard'],
            ['products', '▫', 'Products'],
            ['stock', '↕', 'Stock Overview'],
          ].map(([id, icon, label]) => (
            <button
              className={`side-link ${page === id ? 'active' : ''}`}
              key={id}
              onClick={() => setPage(id)}
              type="button"
            >
              <span aria-hidden="true">{icon}</span> {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {page === 'dashboard'
                ? 'Inventory Dashboard'
                : page === 'products'
                  ? 'Products'
                  : 'Stock Overview'}
            </h1>
            <p>Manage your products and stock in one place.</p>
          </div>
          <span className={`status ${error ? 'disconnected' : ''}`}>
            ● {loading ? 'Connecting to database' : error ? 'Backend unavailable' : 'Database connected'}
          </span>
        </header>

        {error && (
          <div className="message error-message" role="alert">
            {error}
            <button className="text-button" onClick={loadProducts} type="button">
              Retry
            </button>
          </div>
        )}
        {notice && <p className="message success-message" role="status">{notice}</p>}

        <section className="stats" aria-label="Inventory summary">
          <div className="stat-card">
            <p>Total Products</p>
            <h2>{products.length}</h2>
          </div>
          <div className="stat-card">
            <p>Total Units in Stock</p>
            <h2>{totalStock.toLocaleString('en-IN')}</h2>
          </div>
          <div className="stat-card">
            <p>Inventory Value</p>
            <h2>₹{inventoryValue.toLocaleString('en-IN')}</h2>
          </div>
          <div className="stat-card warning">
            <p>Low-Stock Products</p>
            <h2>{lowStock}</h2>
          </div>
        </section>

        {page === 'dashboard' && (
          <section className="panel">
            <h2>{editingProduct ? 'Edit Product' : 'Add a Product'}</h2>
            <form className="product-form" onSubmit={saveProduct}>
              <label>
                Product name
                <input
                  maxLength="150"
                  onChange={event => setName(event.target.value)}
                  placeholder="Product name"
                  required
                  value={name}
                />
              </label>
              <label>
                Category
                <input
                  maxLength="100"
                  onChange={event => setCategory(event.target.value)}
                  placeholder="Category"
                  required
                  value={category}
                />
              </label>
              <label>
                Unit price (₹)
                <input
                  min="0"
                  onChange={event => setPrice(event.target.value)}
                  placeholder="Unit price (₹)"
                  required
                  step="0.01"
                  type="number"
                  value={price}
                />
              </label>
              <label>
                Current stock
                <input
                  min="0"
                  onChange={event => setStock(event.target.value)}
                  placeholder="Current stock"
                  required
                  step="1"
                  type="number"
                  value={stock}
                />
              </label>
              <div className="form-actions">
                <button disabled={saving} type="submit">
                  {saving ? 'Saving...' : editingProduct ? 'Save Changes' : '+ Add Product'}
                </button>
                {editingProduct && (
                  <button className="secondary-button" onClick={resetForm} type="button">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        {page === 'products' && (
          <section className="panel">
            <div className="table-heading">
              <h2>Product Inventory</h2>
              <input
                aria-label="Search products"
                onChange={event => setSearch(event.target.value)}
                placeholder="Search products..."
                type="search"
                value={search}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Unit Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category}</td>
                      <td>₹{product.price.toLocaleString('en-IN')}</td>
                      <td>{product.stock}</td>
                      <td>
                        <span className={`badge ${product.stock < 10 ? 'low' : 'good'}`}>
                          {product.stock < 10 ? 'Low stock' : 'In stock'}
                        </span>
                      </td>
                      <td className="actions">
                        <button className="edit-btn" onClick={() => startEditing(product)} type="button">
                          Edit
                        </button>
                        <button
                          className="delete-btn"
                          disabled={deletingId === product.id}
                          onClick={() => deleteProduct(product)}
                          type="button"
                        >
                          {deletingId === product.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredProducts.length === 0 && (
                    <tr>
                      <td className="empty" colSpan="6">
                        {products.length === 0
                          ? 'No products yet. Add your first product from the dashboard.'
                          : 'No products match your search.'}
                      </td>
                    </tr>
                  )}
                  {loading && (
                    <tr><td className="empty" colSpan="6">Loading products from database...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === 'stock' && (
          <section className="panel">
            <div className="table-heading">
              <div>
                <h2>Stock Overview</h2>
                <p>Adjust quantities and see the updated database values.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Status</th>
                    <th>Update Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category}</td>
                      <td>{product.stock}</td>
                      <td>
                        <span className={`badge ${product.stock < 10 ? 'low' : 'good'}`}>
                          {product.stock < 10 ? 'Low stock' : 'In stock'}
                        </span>
                      </td>
                      <td>
                        {editingStockId === product.id ? (
                          <div className="stock-editor">
                            <input
                              aria-label={`New stock for ${product.name}`}
                              min="0"
                              onChange={event => setStockValue(event.target.value)}
                              step="1"
                              type="number"
                              value={stockValue}
                            />
                            <button
                              disabled={saving || stockValue === ''}
                              onClick={() => saveStock(product)}
                              type="button"
                            >
                              Save
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => setEditingStockId(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="edit-btn"
                            onClick={() => {
                              setEditingStockId(product.id)
                              setStockValue(String(product.stock))
                            }}
                            type="button"
                          >
                            Update stock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loading && products.length === 0 && (
                    <tr><td className="empty" colSpan="5">No stock records to display.</td></tr>
                  )}
                  {loading && (
                    <tr><td className="empty" colSpan="5">Loading stock from database...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
