'use client'

import { useState, useEffect } from 'react'
import { TrendingUp } from 'lucide-react'

export default function BiddingPortalNewsTicker() {
  const [breakingNews, setBreakingNews] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBreakingNews = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/blogs?category=breaking_news&status=published&limit=1')
        
        if (response.ok) {
          const blogs = await response.json()
          if (blogs && blogs.length > 0) {
            const newsText = blogs[0].excerpt || blogs[0].title
            if (newsText) {
              setBreakingNews(newsText)
            } else {
              setBreakingNews(null)
            }
          } else {
            setBreakingNews(null)
          }
        } else {
          setBreakingNews(null)
        }
      } catch (error) {
        console.error('Error fetching breaking news:', error)
        setBreakingNews(null)
      } finally {
        setLoading(false)
      }
    }

    fetchBreakingNews()
  }, [])

  // Don't render if no news and not loading
  if (!loading && !breakingNews) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-teal-50 via-teal-100/50 to-teal-50 border-b border-teal-200/50 py-2.5 px-4 lg:px-6 w-full">
      <div className="relative w-full overflow-hidden max-w-full">
        {loading ? (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-teal-300 rounded animate-pulse flex-shrink-0"></div>
            <div className="h-4 bg-teal-300 rounded animate-pulse flex-1 max-w-md"></div>
          </div>
        ) : breakingNews ? (
          <div className="flex items-center gap-4 w-full">
            <div className="flex items-center gap-2 flex-shrink-0 pr-4 border-r border-teal-300/50">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide whitespace-nowrap">Latest Update</span>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden max-w-full">
              <div className="overflow-hidden">
                <div className="inline-block whitespace-nowrap animate-marquee-slow">
                  <span className="text-sm text-gray-700 font-medium">{breakingNews}</span>
                  <span className="inline-block w-8"></span>
                  <span className="text-sm text-gray-700 font-medium">{breakingNews}</span>
                  <span className="inline-block w-8"></span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
