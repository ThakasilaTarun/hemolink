import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Droplet, ArrowLeft, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { getDashboardPathForRole, getUserRole, UserRole } from "@/utils/userRole";
import { SupabaseSetupCard } from "@/components/SupabaseSetupCard";
import {
  formatAuthError,
  isSupabaseConfigured,
  normalizeIndianPhone,
  resolveSupabaseConfig,
} from "@/lib/supabase-config";
import { ensureUserProfileAndRole } from "@/lib/registration";

type RegistrationRole = Extract<UserRole, "donor" | "hospital">;

// Validation schemas
const indianPhoneSchema = z.string()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Please enter a valid Indian phone number (10 digits starting with 6-9)");

const ageSchema = z.number()
  .int("Age must be a whole number")
  .min(18, "You must be at least 18 years old to donate blood")
  .max(65, "Donors must be 65 years or younger");

const weightSchema = z.number()
  .min(45, "Donors must weigh at least 45 kg")
  .max(200, "Please enter a valid weight");

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[@$!%*?&#]/, "Password must contain at least one special character (@$!%*?&#)");

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const supabaseProjectId = resolveSupabaseConfig().projectId ?? "rktxgqukqglwynezerpy";
  const emailSettingsUrl = `https://supabase.com/dashboard/project/${supabaseProjectId}/auth/providers`;
  const [role, setRole] = useState<RegistrationRole>("donor");
  const [isLoading, setIsLoading] = useState(false);
  const [isBackendReady, setIsBackendReady] = useState(isSupabaseConfigured());

  // Validation errors
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [ageError, setAgeError] = useState("");
  const [weightError, setWeightError] = useState("");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [location, setLocation] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");

  // Redirect if already logged in
  useEffect(() => {
    const redirectIfLoggedIn = async () => {
      if (!isSupabaseConfigured()) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const userRole = await getUserRole();
          navigate(getDashboardPathForRole(userRole));
        }
      } catch {
        // Backend not ready yet
      }
    };
    redirectIfLoggedIn();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;

      toast({
        title: "Login successful!",
        description: "Welcome back to HEMO LINK",
      });

      const userRole = await getUserRole();
      navigate(getDashboardPathForRole(userRole));
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: formatAuthError(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const validatePhone = (phone: string) => {
    try {
      indianPhoneSchema.parse(normalizeIndianPhone(phone));
      setPhoneError("");
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setPhoneError(error.errors[0].message);
      }
      return false;
    }
  };

  const validatePassword = (password: string) => {
    try {
      passwordSchema.parse(password);
      setPasswordError("");
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setPasswordError(error.errors[0].message);
      }
      return false;
    }
  };

  const validateAge = (ageString: string) => {
    try {
      const ageNum = parseInt(ageString, 10);
      if (isNaN(ageNum)) {
        setAgeError("Please enter a valid age");
        return false;
      }
      ageSchema.parse(ageNum);
      setAgeError("");
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setAgeError(error.errors[0].message);
      }
      return false;
    }
  };

  const validateWeight = (weightString: string) => {
    try {
      const weightNum = parseFloat(weightString);
      if (isNaN(weightNum)) {
        setWeightError("Please enter a valid weight");
        return false;
      }
      weightSchema.parse(weightNum);
      setWeightError("");
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setWeightError(error.errors[0].message);
      }
      return false;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSupabaseConfigured()) {
      toast({
        title: "Backend not connected",
        description: formatAuthError(new Error("Failed to fetch")),
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (!registerName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name.",
        variant: "destructive",
      });
      return;
    }

    if (!registerEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate phone number
    if (!validatePhone(registerPhone)) {
      toast({
        title: "Invalid phone number",
        description: phoneError,
        variant: "destructive",
      });
      return;
    }

    // Validate donor-specific fields
    if (role === "donor" && !bloodGroup) {
      toast({
        title: "Blood group required",
        description: "Please select your blood group.",
        variant: "destructive",
      });
      return;
    }

    if (role === "donor" && !age) {
      toast({
        title: "Age required",
        description: "Please enter your age.",
        variant: "destructive",
      });
      return;
    }

    if (role === "donor" && !validateAge(age)) {
      toast({
        title: "Invalid age",
        description: ageError,
        variant: "destructive",
      });
      return;
    }

    if (role === "donor" && !location?.trim()) {
      toast({
        title: "Location required",
        description: "Please enter your location.",
        variant: "destructive",
      });
      return;
    }

    if (role === "donor" && !weight) {
      toast({
        title: "Weight required",
        description: "Please enter your weight.",
        variant: "destructive",
      });
      return;
    }

    if (role === "donor" && !validateWeight(weight)) {
      toast({
        title: "Invalid weight",
        description: weightError,
        variant: "destructive",
      });
      return;
    }

    // Validate hospital-specific fields
    if (role === "hospital" && !hospitalAddress?.trim()) {
      toast({
        title: "Hospital address required",
        description: "Please enter the hospital address.",
        variant: "destructive",
      });
      return;
    }

    // Validate password
    if (!validatePassword(registerPassword)) {
      toast({
        title: "Invalid password",
        description: passwordError,
        variant: "destructive",
      });
      return;
    }

    if (registerPassword !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const phone = normalizeIndianPhone(registerPhone);

    try {
      let userId: string;
      let session = null as { access_token: string } | null;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: registerEmail.trim(),
        password: registerPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { role },
        },
      });

      if (authError?.message?.includes("User already registered")) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: registerEmail.trim(),
          password: registerPassword,
        });
        if (signInError) throw signInError;
        if (!signInData.user) throw new Error("Could not sign in existing account");
        userId = signInData.user.id;
        session = signInData.session;
      } else {
        if (authError) throw authError;
        if (!authData.user) throw new Error("No user returned from signup");
        userId = authData.user.id;
        session = authData.session;

        if (!session) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: registerEmail.trim(),
            password: registerPassword,
          });
          if (!signInError && signInData.session) {
            session = signInData.session;
          }
        }
      }

      await ensureUserProfileAndRole({
        userId,
        fullName: registerName.trim(),
        phone,
        role,
        email: registerEmail.trim(),
        password: registerPassword,
        bloodGroup: role === "donor" ? bloodGroup : undefined,
        location: role === "donor" ? location : undefined,
        age: role === "donor" ? parseInt(age, 10) : undefined,
        weight: role === "donor" ? parseFloat(weight) : undefined,
        hospitalName: role === "hospital" ? registerName.trim() : undefined,
        hospitalAddress: role === "hospital" ? hospitalAddress : undefined,
      });

      if (!session) {
        toast({
          title: "Confirm your email",
          description:
            "Account created. Check your inbox for a confirmation link, then sign in.",
        });
        return;
      }

      toast({
        title: "Registration successful!",
        description: "Your account has been created. Redirecting to your portal...",
      });

      const destination = getDashboardPathForRole(role);
      setTimeout(() => {
        navigate(destination);
      }, 500);
    } catch (error: any) {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: formatAuthError(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        
        <Card className="shadow-strong">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Droplet className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Welcome to HEMO LINK</CardTitle>
            <CardDescription>
              Sign in to manage blood donations and save lives
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isBackendReady && (
              <SupabaseSetupCard onConnected={() => setIsBackendReady(true)} />
            )}
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <Alert className="mb-4 border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-50">
                  <Mail className="h-4 w-4" />
                  <AlertTitle className="text-sm">Avoid email rate limits</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    In Supabase → Authentication → Email, turn off{" "}
                    <strong>Confirm email</strong> for instant signup without confirmation emails.{" "}
                    <a
                      href={emailSettingsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      Open email settings
                    </a>
                  </AlertDescription>
                </Alert>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Register As</Label>
                    <Select value={role} onValueChange={(value) => setRole(value as RegistrationRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="donor">Donor</SelectItem>
                        <SelectItem value="hospital">Hospital</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-name">
                      {role === "hospital" ? "Hospital Name" : "Full Name"}
                    </Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder={role === "hospital" ? "City General Hospital" : ""}
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="your@email.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-phone">Phone Number</Label>
                    <Input
                      id="register-phone"
                      type="tel"
                      placeholder="+91 9876543210 "
                      value={registerPhone}
                      onChange={(e) => {
                        setRegisterPhone(e.target.value);
                        validatePhone(e.target.value);
                      }}
                      className={phoneError ? "border-destructive" : ""}
                      required
                    />
                    {phoneError && (
                      <p className="text-sm text-destructive">{phoneError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      
                    </p>
                  </div>

                  {role === "donor" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="blood-group">Blood Group</Label>
                        <Select value={bloodGroup} onValueChange={setBloodGroup}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select blood group" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A+">A+</SelectItem>
                            <SelectItem value="A-">A-</SelectItem>
                            <SelectItem value="B+">B+</SelectItem>
                            <SelectItem value="B-">B-</SelectItem>
                            <SelectItem value="AB+">AB+</SelectItem>
                            <SelectItem value="AB-">AB-</SelectItem>
                            <SelectItem value="O+">O+</SelectItem>
                            <SelectItem value="O-">O-</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="age">Age</Label>
                        <Input
                          id="age"
                          type="number"
                          placeholder="Enter your age (18-65)"
                          value={age}
                          onChange={(e) => {
                            setAge(e.target.value);
                            if (e.target.value) {
                              validateAge(e.target.value);
                            }
                          }}
                          min="18"
                          max="65"
                          className={ageError ? "border-destructive" : ""}
                          required
                        />
                        {ageError && (
                          <p className="text-sm text-destructive">{ageError}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Must be between 18-65 years old
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          type="text"
                          placeholder="City, State"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="weight">Weight (kg)</Label>
                        <Input
                          id="weight"
                          type="number"
                          placeholder="Minimum 45 kg"
                          value={weight}
                          onChange={(e) => {
                            setWeight(e.target.value);
                            if (e.target.value) {
                              validateWeight(e.target.value);
                            }
                          }}
                          min="45"
                          max="200"
                          step="0.1"
                          className={weightError ? "border-destructive" : ""}
                          required
                        />
                        {weightError && (
                          <p className="text-sm text-destructive">{weightError}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Minimum 45 kg required for donor registration
                        </p>
                      </div>
                    </>
                  )}

                  {role === "hospital" && (
                    <div className="space-y-2">
                      <Label htmlFor="address">Hospital Address</Label>
                      <Input
                        id="address"
                        type="text"
                        placeholder="123 Medical Center Blvd"
                        value={hospitalAddress}
                        onChange={(e) => setHospitalAddress(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="••••••••"
                      value={registerPassword}
                      onChange={(e) => {
                        setRegisterPassword(e.target.value);
                        validatePassword(e.target.value);
                      }}
                      className={passwordError ? "border-destructive" : ""}
                      required
                    />
                    {passwordError && (
                      <p className="text-sm text-destructive">{passwordError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
