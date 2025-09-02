// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal


import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AssignRoleForm from '@/components/AssignRoleForm';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Settings,
  Package,
  AlertTriangle
} from 'lucide-react';

const AdminPanel = () => {
  const { toast } = useToast();
  const [identities, setIdentities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // New user form state
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    chaincode_alias: '',
    role: 'farmer'
  });

  useEffect(() => {
    loadIdentities();
  }, []);

  const loadIdentities = async () => {
    try {
      const data = await apiClient.getAllIdentities();
      console.log('Identities response:', data);
      setIdentities(data || []);
    } catch (error) {
      toast({
        title: "Error loading identities",
        description: error instanceof Error ? error.message : "Failed to load identities",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    try {
      await apiClient.registerUser(newUser);
      toast({
        title: "User created successfully",
        description: `User ${newUser.username} has been registered and enrolled.`,
      });
      
      // Reset form
      setNewUser({
        username: '',
        password: '',
        chaincode_alias: '',
        role: 'farmer'
      });
      
      // Reload identities
      loadIdentities();
    } catch (error) {
      toast({
        title: "Error creating user",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMakeAdmin = async (alias: string) => {
    try {
      await apiClient.makeAdmin(alias);
      toast({
        title: "Admin privileges granted",
        description: `${alias} is now an administrator.`,
      });
      loadIdentities();
    } catch (error) {
      toast({
        title: "Error granting admin privileges",
        description: error instanceof Error ? error.message : "Failed to grant admin privileges",
        variant: "destructive",
      });
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'farmer': return 'bg-green-100 text-green-800';
      case 'processor': return 'bg-blue-100 text-blue-800';
      case 'distributor': return 'bg-yellow-100 text-yellow-800';
      case 'retailer': return 'bg-purple-100 text-purple-800';
      case 'certifier': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Function to get the display name for an identity
  const getIdentityDisplayName = (identity: any) => {
    // Try different possible field names from the chaincode response
    return identity.alias || identity.shortName || identity.enrollmentID || identity.fullId || 'Unknown';
  };

  // Function to get the identity ID
  const getIdentityId = (identity: any) => {
    return identity.enrollmentID || identity.alias || identity.shortName || identity.fullId;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-emerald-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600">Manage users, roles, and system settings</p>
          </div>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>User Management</span>
            </TabsTrigger>
            <TabsTrigger value="create-user" className="flex items-center space-x-2">
              <UserPlus className="h-4 w-4" />
              <span>Create User</span>
            </TabsTrigger>
            <TabsTrigger value="assign-role" className="flex items-center space-x-2">
              <UserPlus className="h-4 w-4" />
              <span>Assign Role</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>System</span>
            </TabsTrigger>
          </TabsList>

          {/* User Management Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Registered Users</CardTitle>
                <CardDescription>
                  Manage user roles and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {identities.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No users found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {identities.map((identity, index) => {
                      const displayName = getIdentityDisplayName(identity);
                      const identityId = getIdentityId(identity);
                      
                      return (
                        <div
                          key={identityId || index}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div>
                              <h3 className="font-medium text-gray-900">
                                {displayName}
                              </h3>
                              <p className="text-sm text-gray-500">
                                ID: {identityId}
                              </p>
                              {identity.fullId && (
                                <p className="text-xs text-gray-400 max-w-md truncate">
                                  Full ID: {identity.fullId}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {identity.roles && identity.roles.map((role: string) => (
                                <Badge key={role} className={getRoleBadgeColor(role)}>
                                  {role}
                                </Badge>
                              ))}
                              {identity.isAdmin && (
                                <Badge className="bg-red-100 text-red-800">
                                  Admin
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            {!identity.isAdmin && identityId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMakeAdmin(identityId)}
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                Make Admin
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Create User Tab */}
          <TabsContent value="create-user" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create New User</CardTitle>
                <CardDescription>
                  Register a new user in the supply chain system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={newUser.username}
                        onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                        required
                        placeholder="Enter username"
                      />
                    </div>
                    <div>
                      <Label htmlFor="chaincode_alias">Chaincode Alias</Label>
                      <Input
                        id="chaincode_alias"
                        value={newUser.chaincode_alias}
                        onChange={(e) => setNewUser(prev => ({ ...prev, chaincode_alias: e.target.value }))}
                        required
                        placeholder="Unique alias for blockchain"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                        required
                        placeholder="Enter password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select value={newUser.role} onValueChange={(value) => setNewUser(prev => ({ ...prev, role: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="farmer">Farmer</SelectItem>
                          <SelectItem value="processor">Processor</SelectItem>
                          <SelectItem value="distributor">Distributor</SelectItem>
                          <SelectItem value="retailer">Retailer</SelectItem>
                          <SelectItem value="certifier">Certifier</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={actionLoading}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {actionLoading ? 'Creating...' : 'Create User'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assign Role Tab */}
          <TabsContent value="assign-role" className="space-y-6">
            <AssignRoleForm
              identities={identities}
              onSuccess={() => loadIdentities()}
              onCancel={() => {}}
            />
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Package className="h-5 w-5" />
                    <span>System Statistics</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Users:</span>
                      <span className="font-medium">{identities.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Administrators:</span>
                      <span className="font-medium">
                        {identities.filter(i => i.isAdmin).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active Roles:</span>
                      <span className="font-medium">
                        {new Set(identities.flatMap(i => i.roles || [])).size}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span>System Health</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Blockchain Status:</span>
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">API Status:</span>
                      <Badge className="bg-green-100 text-green-800">Operational</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Database:</span>
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdminPanel;
