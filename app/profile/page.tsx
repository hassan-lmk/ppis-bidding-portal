'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import PublicSiteHeader from '../components/PublicSiteHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import PasswordRequirements from '../components/PasswordRequirements'
import { passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'
import { Building2, ChevronDown, ChevronRight, Loader2, Mail, MapPin, Phone } from 'lucide-react'

type ProfileData = {
  company_name: string | null
  address: string | null
  poc_contact_number: string | null
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [passwordCardOpen, setPasswordCardOpen] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/profile')
      return
    }

    const loadProfile = async () => {
      if (!user?.id) return
      setLoading(true)
      try {
        let { data } = await supabase
          .from('user_profiles')
          .select('company_name, address, poc_contact_number')
          .eq('id', user.id)
          .maybeSingle()

        if (!data) {
          const alt = await supabase
            .from('user_profiles')
            .select('company_name, address, poc_contact_number')
            .eq('user_id', user.id)
            .maybeSingle()
          data = alt.data
        }

        setProfile((data as ProfileData) || null)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      void loadProfile()
    }
  }, [authLoading, user, router])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordStatus(null)

    if (!passwordMeetsPolicy(newPassword)) {
      setPasswordStatus({ type: 'error', text: passwordPolicyErrorMessage() })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', text: 'Confirm password does not match.' })
      return
    }

    setUpdatingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        throw error
      }
      setPasswordStatus({ type: 'ok', text: 'Password updated successfully.' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordStatus({ type: 'error', text: err?.message || 'Failed to update password.' })
    } finally {
      setUpdatingPassword(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PublicSiteHeader variant="solid" />
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicSiteHeader variant="solid" />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Card className="border-0 text-white overflow-hidden bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 shadow-xl">
          <CardContent className="p-6 md:p-8">
            <p className="text-white/80 text-sm uppercase tracking-wide font-semibold">My Account</p>
            <h1 className="text-2xl md:text-3xl font-bold mt-2">
              {profile?.company_name || 'Profile Details'}
            </h1>
            <p className="text-white/85 mt-2 text-sm md:text-base">
              Manage your organization information and account security settings.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-gray-200">
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
            <CardDescription>Your current profile information.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Company Name</p>
                <div className="flex items-center gap-2 text-gray-900">
                  <Building2 className="w-4 h-4 text-teal-600" />
                  <span className="font-medium">{profile?.company_name || '-'}</span>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Email</p>
                <div className="flex items-center gap-2 text-gray-900">
                  <Mail className="w-4 h-4 text-teal-600" />
                  <span className="font-medium">{user?.email || '-'}</span>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">POC Contact Number</p>
                <div className="flex items-center gap-2 text-gray-900">
                  <Phone className="w-4 h-4 text-teal-600" />
                  <span className="font-medium">{profile?.poc_contact_number || '-'}</span>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Address</p>
                <div className="flex items-start gap-2 text-gray-900">
                  <MapPin className="w-4 h-4 text-teal-600 mt-0.5" />
                  <span className="font-medium">{profile?.address || '-'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-gray-200">
          <CardHeader>
            <button
              type="button"
              onClick={() => setPasswordCardOpen((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <CardTitle>Change Password</CardTitle>
              {passwordCardOpen ? (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-500" />
              )}
            </button>
            <CardDescription>Use a strong password to secure your account.</CardDescription>
          </CardHeader>
          {passwordCardOpen && (
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                />
                <PasswordRequirements password={newPassword} />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  required
                />
                {passwordStatus && (
                  <p className={passwordStatus.type === 'ok' ? 'text-emerald-700 text-sm' : 'text-red-700 text-sm'}>
                    {passwordStatus.text}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={updatingPassword}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {updatingPassword ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </main>
    </div>
  )
}

