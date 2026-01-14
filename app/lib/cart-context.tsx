'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Area } from './bidding-api'

interface CartItem {
  area: Area
  quantity: number
}

interface CartContextType {
  items: CartItem[]
  addToCart: (area: Area) => void
  removeFromCart: (areaId: string) => void
  updateQuantity: (areaId: string, quantity: number) => void
  clearCart: () => void
  getTotalPrice: () => number
  getTotalItems: () => number
  isInCart: (areaId: string) => boolean
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('bidding-cart')
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart))
      } catch (error) {
        console.error('Error loading cart from localStorage:', error)
      }
    }
  }, [])

  // Save cart to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem('bidding-cart', JSON.stringify(items))
  }, [items])

  const addToCart = (area: Area) => {
    setItems(prevItems => {
      const existingItem = prevItems.find(item => item.area.id === area.id)
      if (existingItem) {
        // If item already exists, increase quantity
        return prevItems.map(item =>
          item.area.id === area.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      } else {
        // Add new item to cart
        return [...prevItems, { area, quantity: 1 }]
      }
    })
  }

  const removeFromCart = (areaId: string) => {
    setItems(prevItems => prevItems.filter(item => item.area.id !== areaId))
  }

  const updateQuantity = (areaId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(areaId)
      return
    }
    
    setItems(prevItems =>
      prevItems.map(item =>
        item.area.id === areaId
          ? { ...item, quantity }
          : item
      )
    )
  }

  const clearCart = () => {
    setItems([])
  }

  const getTotalPrice = () => {
    return items.reduce((total, item) => total + (item.area.price * item.quantity), 0)
  }

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.quantity, 0)
  }

  const isInCart = (areaId: string) => {
    return items.some(item => item.area.id === areaId)
  }

  const value = {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalPrice,
    getTotalItems,
    isInCart,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

