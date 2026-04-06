'use client'

import { useEffect, useRef, useState } from 'react'

export interface CompanyNameAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  /** Tailwind focus ring color token — matches parent form */
  ringClass?: string
  helperText?: string
  label?: string
}

/**
 * Company name from `companies.company_name` via GET /api/companies (active rows only).
 * Users can always type a name that is not in the list.
 */
export default function CompanyNameAutocomplete({
  id = 'companyName',
  value,
  onChange,
  disabled,
  required = true,
  ringClass = 'focus:ring-teal-600',
  helperText = 'Select from the list or type to search. You can also enter a company name that is not listed.',
  label = 'Company name',
}: CompanyNameAutocompleteProps) {
  const [companyNames, setCompanyNames] = useState<string[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<string[]>([])
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const companyInputRef = useRef<HTMLInputElement>(null)
  const companyDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies')
        if (response.ok) {
          const companies = (await response.json()) as string[]
          setCompanyNames(companies)
          setFilteredCompanies(companies)
        } else {
          setCompanyNames([])
          setFilteredCompanies([])
        }
      } catch {
        setCompanyNames([])
        setFilteredCompanies([])
      }
    }
    fetchCompanies()
  }, [])

  const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v)
    if (v.trim()) {
      const filtered = companyNames.filter(company =>
        company.toLowerCase().includes(v.toLowerCase()),
      )
      setFilteredCompanies(filtered)
      setShowCompanyDropdown(true)
    } else {
      setFilteredCompanies(companyNames)
      setShowCompanyDropdown(true)
    }
  }

  const handleCompanyNameFocus = () => {
    setShowCompanyDropdown(true)
    setFilteredCompanies(companyNames)
  }

  const handleCompanySelect = (company: string) => {
    onChange(company)
    setShowCompanyDropdown(false)
    companyInputRef.current?.focus()
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(event.target as Node) &&
        companyInputRef.current &&
        !companyInputRef.current.contains(event.target as Node)
      ) {
        setShowCompanyDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={companyInputRef}
          type="text"
          value={value}
          onChange={handleCompanyNameChange}
          onFocus={handleCompanyNameFocus}
          className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${ringClass}`}
          placeholder="Select or enter your company name"
          required={required}
          disabled={disabled}
          /* organization is appropriate; free-text still allowed */
          autoComplete="organization"
        />
        {showCompanyDropdown && filteredCompanies.length > 0 && (
          <div
            ref={companyDropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {filteredCompanies.map((company, index) => (
              <button
                key={`${company}-${index}`}
                type="button"
                onClick={() => handleCompanySelect(company)}
                className="w-full text-left px-4 py-2 hover:bg-teal-600 hover:text-white transition-colors cursor-pointer first:rounded-t-lg last:rounded-b-lg"
              >
                {company}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">{helperText}</p>
    </div>
  )
}
